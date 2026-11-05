import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { productSalesModels } from '../../models/product.model.js';
import { productPhotoModels } from '../../models/product-photo.model.js';
import { PRODUCT_PHOTO_LIMITS } from '../../constants/product-photos.js';
import { parseObjectId } from '../../validators/product.validator.js';
import { parsePhotoVersion, parsePhotoIndex, parsePhotoDigest, validatePhotoBody, invalidProductPhoto } from '../../validators/product-photo.validator.js';
import { AppError } from '../../utils/app-error.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { requireProductManager, productSalesErrors } from './product-sales-errors.js';
import { toAdminProduct } from './product-management.service.js';

const processing = new WeakSet();
const pathFor = (id, digest) => `/api/v1/products/${id}/photos/${digest}`;

export function createProductPhotoService({ connection }) {
  const { Product } = productSalesModels(connection);
  const { ProductPhoto } = productPhotoModels(connection);
  const unitOfWork = createUnitOfWork(connection);
  async function readProduct(id, session) {
    const product = await Product.findOne({ _id: id, deletedAt: null }).session(session ?? null).lean();
    if (!product) throw productSalesErrors.notFound();
    return product;
  }
  async function change({ actor, productId, version, index, body, contentType, remove = false }) {
    const uploadedBy = requireProductManager(actor), id = parseObjectId(productId, 'productId');
    const seen = parsePhotoVersion(version), position = index === undefined ? undefined : parsePhotoIndex(index);
    if (remove && position === undefined) throw new AppError(422, 'VALIDATION_FAILED', 'A photo index is required');
    // Reject stale/missing targets before spending image decoding resources.
    const current = await readProduct(id);
    if ((current.detailsVersion ?? 0) !== seen) throw productSalesErrors.versionConflict();
    if (position !== undefined && position >= current.photos.length) throw productSalesErrors.notFound();
    if (position === undefined && current.photos.length >= PRODUCT_PHOTO_LIMITS.maxPhotos) throw new AppError(422, 'PRODUCT_PHOTO_LIMIT', 'At most five photos per product');
    let image;
    if (!remove) {
      validatePhotoBody(body, contentType);
      if (processing.has(connection)) throw new AppError(503, 'MEDIA_BUSY', 'Image processing is busy');
      processing.add(connection);
      try {
        const source = sharp(body, { limitInputPixels: PRODUCT_PHOTO_LIMITS.maxPixels, animated: false, failOn: 'warning' });
        const metadata = await source.metadata();
        const expected = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }[contentType];
        if (metadata.format !== expected || (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height || metadata.width * metadata.height > PRODUCT_PHOTO_LIMITS.maxPixels) throw invalidProductPhoto();
        const result = await source.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
        if (result.data.length > PRODUCT_PHOTO_LIMITS.maxStoredBytes) throw invalidProductPhoto();
        image = { content: result.data, byteLength: result.data.length, width: result.info.width, height: result.info.height,
          digest: createHash('sha256').update(result.data).digest('hex') };
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw invalidProductPhoto();
      } finally { processing.delete(connection); }
    }
    return unitOfWork.run(async session => {
      const product = await readProduct(id, session);
      if ((product.detailsVersion ?? 0) !== seen) throw productSalesErrors.versionConflict();
      const photos = [...product.photos];
      if (position !== undefined && position >= photos.length) throw productSalesErrors.notFound();
      if (position === undefined && photos.length >= PRODUCT_PHOTO_LIMITS.maxPhotos) throw new AppError(422, 'PRODUCT_PHOTO_LIMIT', 'At most five photos per product');
      if (remove) photos.splice(position, 1);
      else {
        const path = pathFor(id, image.digest);
        if (photos.includes(path) && photos[position] !== path) throw new AppError(422, 'PRODUCT_PHOTO_DUPLICATE', 'This photo is already on the product');
        if (position === undefined) photos.push(path); else photos[position] = path;
        await ProductPhoto.updateOne({ productId: id, digest: image.digest }, { $setOnInsert: { ...image, uploadedBy } }, { upsert: true, session });
      }
      const versionFilter = seen === 0 ? { $or: [{ detailsVersion: 0 }, { detailsVersion: { $exists: false } }] } : { detailsVersion: seen };
      const updated = await Product.findOneAndUpdate({ _id: id, deletedAt: null, ...versionFilter }, { $set: { photos }, $inc: { detailsVersion: 1 } }, { returnDocument: 'after', session }).lean();
      if (!updated) throw productSalesErrors.versionConflict();
      // Only uploaded blobs belonging to this product can be removed. Static sample assets stay intact.
      const retained = photos.map(path => path.startsWith(`/api/v1/products/${id}/photos/`) ? path.split('/').at(-1) : null).filter(Boolean);
      await ProductPhoto.deleteMany({ productId: id, digest: { $nin: retained } }, { session });
      return toAdminProduct(updated);
    });
  }
  return Object.freeze({
    upload: input => change(input),
    remove: input => change({ ...input, remove: true }),
    async read({ actor, productId, digest, admin = false }) {
      if (admin) requireProductManager(actor);
      const id = parseObjectId(productId, 'productId'), hash = parsePhotoDigest(digest);
      const product = await readProduct(id);
      if ((!admin && !product.visible) || !product.photos.includes(pathFor(id, hash))) throw productSalesErrors.notFound();
      const image = await ProductPhoto.findOne({ productId: id, digest: hash }).select('+content').lean();
      if (!image) throw productSalesErrors.notFound();
      const body = Buffer.isBuffer(image.content) ? image.content : Buffer.from(image.content.buffer);
      if (body.length !== image.byteLength) throw new AppError(503, 'PRODUCT_PHOTO_UNAVAILABLE', 'Image is unavailable');
      return body;
    }
  });
}

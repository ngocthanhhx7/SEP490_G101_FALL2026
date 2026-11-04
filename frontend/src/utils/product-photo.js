// Hidden products use the Admin image reader; static catalog assets keep their paths.
export function adminProductPhotoUrl(photo) {
  return /^\/api\/v1\/products\/[a-f0-9]{24}\/photos\/[a-f0-9]{64}$/.test(photo ?? '')
    ? photo.replace('/api/v1/products/', '/api/v1/admin/products/') : photo;
}

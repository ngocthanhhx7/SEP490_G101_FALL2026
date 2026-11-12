const text = maxLength => ({ bsonType: 'string', minLength: 1, maxLength });
const common = {
  _id: { bsonType: 'objectId' }, kind: { enum: ['BREED', 'TRAIT'] }, code: text(80),
  active: { bsonType: 'bool' }, createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' }
};
export const referenceCatalogValidator = {
  $jsonSchema: {
    bsonType: 'object',
    oneOf: [
      { additionalProperties: false, required: ['_id', 'kind', 'code', 'name', 'species', 'source'],
        properties: { ...common, kind: { enum: ['BREED'] }, name: text(100), species: { enum: ['DOG', 'CAT'] }, source: text(500) } },
      { additionalProperties: false, required: ['_id', 'kind', 'code', 'label', 'species', 'explanation'],
        properties: { ...common, kind: { enum: ['TRAIT'] }, label: text(160),
          species: { bsonType: 'array', items: { enum: ['DOG', 'CAT'] } }, explanation: text(1000) } }
    ]
  }
};
export const referenceCatalogCollectionOptions = {
  validator: referenceCatalogValidator, validationLevel: 'strict', validationAction: 'error'
};
export const referenceCatalogIndexes = [
  { key: { kind: 1, code: 1 }, name: 'reference_catalog_kind_code', unique: true },
  { key: { active: 1, species: 1, name: 1 }, name: 'reference_catalog_breed_list', partialFilterExpression: { kind: 'BREED' } }
];

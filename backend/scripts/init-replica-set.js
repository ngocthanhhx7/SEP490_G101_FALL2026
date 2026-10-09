const hello = db.adminCommand({ hello: 1 });

if (hello.setName === 'rs0') {
  print('Replica set rs0 is already initialized.');
} else {
  const result = rs.initiate({
    _id: 'rs0',
    // The backend currently runs on the host, so advertise the published local endpoint.
    members: [{ _id: 0, host: 'localhost:27017' }],
  });

  if (result.ok !== 1) {
    throw new Error(`Could not initialize replica set rs0: ${JSON.stringify(result)}`);
  }

  print('Replica set rs0 initialized.');
}

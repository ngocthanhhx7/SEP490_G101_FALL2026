# Customer visit tracker

Read-only projection for UC-78. The service checks booking ownership and current
visit membership before reading execution milestones, the assigned sitter and
published ratings. During active care, it returns recorded tasks visible to the
customer, with their pet and private image references. The existing private image
route authorizes each read. No image bytes, address access notes or location
history are returned. The route is mounted by the customer read runtime with
booking checkout.

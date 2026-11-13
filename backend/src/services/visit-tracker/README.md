# Customer visit tracker

Read-only projection for UC-78. The service checks booking ownership and current
visit membership before reading execution milestones, the assigned sitter and
published ratings. No raw evidence, address access notes or location history is
returned. The route is mounted by the customer read runtime with booking checkout.

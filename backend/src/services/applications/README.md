# Application services

This folder contains backend application-specific services that expose narrowly scoped applicant workflows. `application-status.service.js` accepts an application-bound OTP port and a repository that returns an applicant-safe status projection. It never reads or returns identity documents, contact details, or a sitter session.

P06 must provide the application-bound OTP purpose and server-side limits, P16 must issue and resolve opaque application codes and expose a compatible status projection, and P34 must register the public routes and compose these ports. Until those integrations land, the service is an isolated fail-closed seam rather than a live endpoint.

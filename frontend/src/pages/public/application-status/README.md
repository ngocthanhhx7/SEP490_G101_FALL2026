# Application status page

This folder owns the public applicant status view and its local responsive styles. The page accepts an injected API with `requestVerification({ applicationCode })` and `verifyAndReadStatus({ applicationCode, challengeId, code })`; P34 owns route registration and API composition. It keeps values in component memory, sends them through request bodies, and only renders the applicant-facing status projection.

The screen follows the provisional P04 tokens and shared UI components. No Figma frame was available in this task, and the page is not registered in the application route tree until the OTP and P16 contracts are integrated.

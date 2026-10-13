const express = require('express');
const { requestOtp, resendOtp, verifyOtp } = require('../controllers/authController');

const router = express.Router();
router.post('/otp/request', requestOtp);
router.post('/otp/resend', resendOtp);
router.post('/otp/verify', verifyOtp);

module.exports = router;

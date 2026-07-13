const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getAudit } = require('../controllers/auditController');
router.get('/', protect, getAudit);
module.exports = router;

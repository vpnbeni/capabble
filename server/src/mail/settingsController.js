/**
 * Settings → School email: the school's own SMTP account for calendar and other
 * school emails. The password is stored encrypted and never sent back.
 */
const express = require('express');
const Joi = require('joi');
const nodemailer = require('nodemailer');
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../rbac/middleware');
const { seal } = require('../utils/secretBox');
const templates = require('./templates');
const { platformSender, schoolSender } = require('./outbox');
const schoolDate = require('../utils/schoolDate');

const schema = Joi.object({
  enabled: Joi.boolean().required(),
  host: Joi.string().trim().hostname().max(200).allow(''),
  port: Joi.number().integer().min(1).max(65535).default(587),
  secure: Joi.boolean().default(false),
  user: Joi.string().trim().max(200).allow(''),
  // Leave empty to keep the stored password.
  password: Joi.string().max(300).allow(''),
  fromName: Joi.string().trim().max(120).allow(''),
  fromEmail: Joi.string().trim().email({ tlds: false }).max(200).allow(''),
  replyTo: Joi.string().trim().email({ tlds: false }).max(200).allow(''),
  dailyLimit: Joi.number().integer().min(1).max(100000).default(1500)
});

const FIELDS = ['enabled', 'host', 'port', 'secure', 'user', 'fromName', 'fromEmail', 'replyTo', 'dailyLimit'];

const view = (settings) => ({
  enabled: Boolean(settings?.enabled),
  host: settings?.host || '',
  port: settings?.port || 587,
  secure: Boolean(settings?.secure),
  user: settings?.user || '',
  hasPassword: Boolean(settings?.password?.data),
  fromName: settings?.fromName || '',
  fromEmail: settings?.fromEmail || '',
  replyTo: settings?.replyTo || '',
  dailyLimit: settings?.dailyLimit || 1500,
  lastTestAt: settings?.lastTestAt || null,
  lastTestOk: settings?.lastTestOk ?? null,
  lastError: settings?.lastError || ''
});

const usage = async (models) => {
  const since = schoolDate.startOfDay(schoolDate.today());
  const [sentToday, queued, failedWeek] = await Promise.all([
    models.MailOutbox.countDocuments({ status: 'sent', sentAt: { $gte: since } }),
    models.MailOutbox.countDocuments({ status: 'queued' }),
    models.MailOutbox.countDocuments({ status: 'failed', updatedAt: { $gte: new Date(Date.now() - 7 * 86400000) } })
  ]);
  return { sentToday, queued, failedWeek };
};

const getSettings = async (req, res, next) => {
  try {
    const { SchoolMailSettings } = req.models;
    const settings = await SchoolMailSettings.findOne({ key: 'default' }).lean();
    const platform = platformSender();
    res.json({
      success: true,
      data: {
        ...view(settings),
        fallback: platform ? { fromEmail: platform.fromEmail, dailyLimit: platform.dailyLimit } : null,
        usage: await usage(req.models)
      }
    });
  } catch (error) {
    next(error);
  }
};

const saveSettings = async (req, res, next) => {
  try {
    const { error, value } = schema.validate(req.body || {}, { abortEarly: true, stripUnknown: true });
    if (error) return res.status(400).json({ success: false, message: error.details[0].message.replace(/"/g, '') });
    const { SchoolMailSettings } = req.models;
    const current = await SchoolMailSettings.findOne({ key: 'default' });
    const doc = current || new SchoolMailSettings({ key: 'default' });
    if (value.enabled && (!value.host || !value.user || !value.fromEmail || (!value.password && !doc.password?.data))) {
      const message = 'Fill in the server, username, password and from address to turn it on.';
      return res.status(400).json({ success: false, message });
    }
    FIELDS.forEach((field) => { doc[field] = value[field]; });
    if (value.password) doc.password = seal(value.password);
    const connectionChanged = !current || Boolean(value.password)
      || ['host', 'port', 'secure', 'user'].some((f) => current[f] !== value[f]);
    if (connectionChanged) {
      doc.lastTestAt = null;
      doc.lastTestOk = null;
      doc.lastError = '';
    }
    doc.updatedBy = req.user._id;
    await doc.save();
    return res.json({ success: true, data: view(doc.toObject()) });
  } catch (error) {
    return next(error);
  }
};

// POST /api/mail-settings/test — connects with the saved settings and emails the person testing.
const testSettings = async (req, res, next) => {
  try {
    const { SchoolMailSettings, SchoolProfile } = req.models;
    const settings = await SchoolMailSettings.findOne({ key: 'default' });
    const sender = schoolSender({ ...(settings?.toObject() || {}), enabled: true });
    if (!sender) {
      const message = 'Save the server, username, password and from address first.';
      return res.status(400).json({ success: false, message });
    }
    const to = req.user.email;
    if (!to) {
      return res.status(400).json({ success: false, message: 'Your login has no email address to send the test to.' });
    }
    const profile = await SchoolProfile.findOne({}).select('schoolName').lean();
    const transport = nodemailer.createTransport({
      host: sender.host,
      port: sender.port,
      secure: sender.secure,
      auth: { user: sender.user, pass: sender.pass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    });
    const mail = templates.mailSettingsTest({ schoolName: profile?.schoolName || '', fromEmail: sender.fromEmail });
    try {
      await transport.sendMail({
        from: { name: sender.fromName || profile?.schoolName || 'School', address: sender.fromEmail },
        to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        attachments: []
      });
      settings.lastTestAt = new Date();
      settings.lastTestOk = true;
      settings.lastError = '';
      await settings.save();
      return res.json({ success: true, data: { sentTo: to } });
    } catch (sendError) {
      const message = String(sendError.message || sendError).slice(0, 300);
      settings.lastTestAt = new Date();
      settings.lastTestOk = false;
      settings.lastError = message;
      await settings.save();
      return res.status(400).json({ success: false, message: `The mail server said: ${message}` });
    } finally {
      transport.close();
    }
  } catch (error) {
    return next(error);
  }
};

const router = express.Router();
router.use(protect);
router.get('/', requirePermission('core.school.read', 'core.school.write'), getSettings);
router.put('/', requirePermission('core.school.write'), saveSettings);
router.post('/test', requirePermission('core.school.write'), testSettings);

const mountRoutes = (tenantRouter) => tenantRouter.use('/mail-settings', router);

module.exports = { mountRoutes, view };

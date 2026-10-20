// "Request a demo" leads from capabble.cloud: a public create endpoint and the platform admin list.
const asyncHandler = require('../../middleware/asyncHandler');
const { sendMail, isMailConfigured } = require('../../utils/mailer');
const mailTemplates = require('../../mail/templates');

const DEFAULT_NOTIFY_EMAIL = 'capabbles@gmail.com';

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0];
  return (first || '').trim() || req.ip || null;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const istTime = (date) => `${date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST`;

const adminDemoRequestsUrl = () => {
  const base = (process.env.ADMIN_PORTAL_URL || '').trim().replace(/\/+$/, '');
  return base ? `${base}/#/demo-requests` : undefined;
};

const notifyRecipients = () => (process.env.DEMO_LEAD_NOTIFY_EMAIL || DEFAULT_NOTIFY_EMAIL)
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

const sendDemoRequestEmails = async (lead) => {
  if (!isMailConfigured()) {
    console.warn(`[demo-request:notify] status=skipped reason=smtp_not_configured id=${lead._id}`);
    return;
  }

  const recipients = notifyRecipients();
  const jobs = [];

  if (recipients.length > 0) {
    jobs.push(sendMail({
      to: recipients.join(', '),
      replyTo: lead.email,
      ...mailTemplates.demoRequestAlert({
        name: lead.name,
        institution: lead.institution,
        role: lead.role,
        email: lead.email,
        phone: lead.phone,
        location: [lead.city, lead.state].filter(Boolean).join(', '),
        studentCount: lead.studentCount,
        modules: lead.modules,
        preferredTime: lead.preferredTime,
        message: lead.message,
        time: istTime(lead.createdAt),
        adminUrl: adminDemoRequestsUrl()
      })
    }).then(() => 'team'));
  }

  jobs.push(sendMail({
    to: lead.email,
    ...mailTemplates.demoRequestReceived({ name: lead.name, institution: lead.institution })
  }).then(() => 'requester'));

  const results = await Promise.allSettled(jobs);
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      console.info(`[demo-request:notify] status=sent to=${result.value} id=${lead._id}`);
    } else {
      console.error(`[demo-request:notify] status=failed id=${lead._id} message=${result.reason?.message}`);
    }
  });
};

/** POST /api/admin/public/demo-requests — public, rate limited, honeypot checked. */
const createDemoRequest = asyncHandler(async (req, res) => {
  const { website, ...fields } = req.body;

  // Honeypot filled in: answer like a success so the bot moves on, but keep nothing.
  if (website) {
    console.info(`[demo-request:create] status=dropped reason=honeypot ip=${getClientIp(req)}`);
    return res.status(201).json({ success: true, message: 'Thanks. We will be in touch shortly.' });
  }

  const { DemoRequest } = req.platformModels;
  const lead = await DemoRequest.create({
    ...fields,
    modules: Array.from(new Set(fields.modules || [])),
    createdIp: getClientIp(req),
    createdUserAgent: String(req.headers['user-agent'] || '').slice(0, 400) || null,
  });

  setImmediate(() => {
    sendDemoRequestEmails(lead).catch((err) => {
      console.error(`[demo-request:notify] status=failed id=${lead._id} message=${err.message}`);
    });
  });

  return res.status(201).json({ success: true, message: 'Thanks. We will be in touch shortly.' });
});

/** GET /api/admin/demo-requests */
const listDemoRequests = asyncHandler(async (req, res) => {
  const { DemoRequest } = req.platformModels;
  const { status, search, page, limit } = req.query;

  const query = {};
  if (status) query.status = status;
  if (search) {
    const pattern = { $regex: escapeRegex(search), $options: 'i' };
    query.$or = [{ name: pattern }, { institution: pattern }, { email: pattern }, { phone: pattern }, { city: pattern }];
  }

  const skip = (page - 1) * limit;
  const [items, total, counts] = await Promise.all([
    DemoRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .select('-createdUserAgent')
      .lean(),
    DemoRequest.countDocuments(query),
    DemoRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  res.status(200).json({
    success: true,
    data: {
      items,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      limit,
      counts: counts.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {}),
    },
  });
});

/** PATCH /api/admin/demo-requests/:id — status and internal notes. */
const updateDemoRequest = asyncHandler(async (req, res) => {
  const { DemoRequest } = req.platformModels;
  const update = { ...req.body };

  if (update.status) {
    update.statusUpdatedAt = new Date();
    update.statusUpdatedBy = req.platformUser?.email || null;
  }

  const lead = await DemoRequest.findByIdAndUpdate(req.params.id, { $set: update }, { new: true }).lean();
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Demo request not found' });
  }

  return res.status(200).json({ success: true, data: lead });
});

module.exports = {
  createDemoRequest,
  listDemoRequests,
  updateDemoRequest,
};

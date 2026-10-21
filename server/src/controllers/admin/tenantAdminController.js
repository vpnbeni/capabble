const asyncHandler = require('../../middleware/asyncHandler');
const { provisionTenant } = require('../../tenancy/provisionTenant');
const { TENANT_STATUS } = require('../../models/platform/Tenant');
const {
  createOnboardingTicket,
  consumeOnboardingTicket,
  refreshOnboardingTicketEmailOtp,
  TICKET_REASONS
} = require('../../tenancy/onboardingTicketService');
const {
  getTenantConnectionAndModels,
  removeTenantFromCache
} = require('../../tenancy/tenantConnectionManager');
const { getPlatformConnection } = require('../../config/platformDatabase');
const { issueSession } = require('../../rbac/session');
const { buildAuthUserPayload } = require('../../rbac/userPayload');
const { ADMINISTRATOR_ROLE } = require('../../rbac/catalog');
const { sendMail } = require('../../utils/mailer');
const mailTemplates = require('../../mail/templates');
const { syncTenantUserDirectoryEntry } = require('../../tenancy/tenantUserDirectoryService');
const {
  registerTenant,
  getTenantEntitlement,
} = require('../../services/billingServiceClient');
const { normalizeTenantFeatureToggles } = require('../../constants/tenantFeatures');

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0];
  }

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip || null;
};

const sendSignupError = (res, statusCode, message, errorCode) => res.status(statusCode).json({
  success: false,
  message,
  errorCode
});

const sendTenantResolveError = (res, statusCode, message) => res.status(statusCode).json({
  success: false,
  message
});

const getOtpExpiryMinutes = (otpExpiresAt) => {
  if (!otpExpiresAt) {
    return 10;
  }

  const ms = new Date(otpExpiresAt).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / (60 * 1000)));
};

const sendSignupOtpEmail = async ({
  recipientEmail,
  tenantName,
  tenantSlug,
  otpCode,
  otpExpiresAt
}) => {
  await sendMail({
    to: recipientEmail,
    ...mailTemplates.signupCode({
      schoolName: tenantName || tenantSlug,
      code: otpCode,
      minutes: getOtpExpiryMinutes(otpExpiresAt)
    })
  });
};

const sendAdminNewTenantNotification = async ({ tenantName, tenantSlug, adminEmail, source }) => {
  const rawAdminEmails = process.env.ADMIN_EMAILS || '';
  const recipients = rawAdminEmails
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  if (recipients.length === 0) return;

  await sendMail({
    to: recipients.join(', '),
    ...mailTemplates.newSchoolAlert({
      tenantName,
      tenantSlug,
      adminEmail,
      source: source === 'admin' ? 'Platform admin' : 'Public signup',
      time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST'
    })
  });
};

const enqueueAdminNewTenantNotification = ({ tenantName, tenantSlug, adminEmail, source }) => {
  setImmediate(async () => {
    try {
      await sendAdminNewTenantNotification({ tenantName, tenantSlug, adminEmail, source });
      console.info(`[tenant-signup:admin-notify] status=sent tenantSlug=${tenantSlug}`);
    } catch (err) {
      console.error(
        `[tenant-signup:admin-notify] status=failed tenantSlug=${tenantSlug} message=${err.message}`
      );
    }
  });
};

const enqueueSignupOtpEmail = ({
  recipientEmail,
  tenantName,
  tenantSlug,
  otpCode,
  otpExpiresAt,
  contextTag
}) => {
  setImmediate(async () => {
    try {
      await sendSignupOtpEmail({
        recipientEmail,
        tenantName,
        tenantSlug,
        otpCode,
        otpExpiresAt
      });

      console.info(
        `[tenant-signup:${contextTag}] status=otp_sent tenantSlug=${tenantSlug}`
      );
    } catch (emailError) {
      console.error(
        `[tenant-signup:${contextTag}] status=otp_delivery_failed `
        + `tenantSlug=${tenantSlug} message=${emailError.message}`
      );
    }
  });
};

const syncDirectoryFromTenantUserBestEffort = async ({ tenantRecord, user }) => {
  if (!tenantRecord?.slug || !tenantRecord?.dbName || !user?._id) {
    return;
  }

  try {
    await syncTenantUserDirectoryEntry({
      tenantSlug: tenantRecord.slug,
      tenantDbName: tenantRecord.dbName,
      tenantUserId: user._id,
      email: user.email,
      role: user.role,
      isActive: user.isActive
    });
  } catch (error) {
    console.error(
      `[tenant-resolve] status=directory_sync_failed tenantSlug=${tenantRecord.slug} message=${error.message}`
    );
  }
};

const buildBillingSnapshot = async (tenantSlug) => {
  if (!tenantSlug) {
    return null;
  }

  try {
    const entitlement = await getTenantEntitlement(tenantSlug);
    return {
      accessMode: entitlement.accessMode || 'full',
      planCode: entitlement.planCode || null,
      trialEndsAt: entitlement.trialEndsAt || null,
      graceEndsAt: entitlement.graceEndsAt || null,
      isReadOnly: Boolean(entitlement.isReadOnly),
      state: entitlement.state || 'active',
    };
  } catch (error) {
    console.error(
      `[tenant-billing] status=snapshot_failed tenantSlug=${tenantSlug} message=${error.message}`
    );
    return null;
  }
};

const onboardTenantBillingBestEffort = async ({
  tenant,
  tenantAdmin,
}) => {
  if (!tenant?.slug || !tenantAdmin?.email) {
    return;
  }

  try {
    // Account and plan invite only; the school opts in to its trial itself.
    await registerTenant({
      tenantId: tenant._id?.toString?.() || tenant._id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      billingEmail: tenant.adminEmail || tenantAdmin.email,
    });
  } catch (error) {
    console.error(
      `[tenant-billing] status=onboard_failed tenantSlug=${tenant.slug} message=${error.message}`
    );
  }
};

const resolveTenantByEmailFallbackScan = async ({ Tenant, email }) => {
  const activeTenants = await Tenant.find({ status: TENANT_STATUS.ACTIVE })
    .select('slug name dbName')
    .lean();

  if (activeTenants.length === 0) {
    return {
      resolvedTenantMatch: null,
      inactiveTenantMatchFound: false
    };
  }

  const tenantMatches = await Promise.all(activeTenants.map(async (tenantRecord) => {
    const { models } = getTenantConnectionAndModels(tenantRecord.dbName, ['User']);
    const user = await models.User.findOne({ email }).select('_id email role isActive').lean();

    if (user) {
      await syncDirectoryFromTenantUserBestEffort({
        tenantRecord,
        user
      });
    }

    return {
      tenantRecord,
      user
    };
  }));

  return {
    resolvedTenantMatch: tenantMatches.find((match) => Boolean(match.user?.isActive)),
    inactiveTenantMatchFound: tenantMatches.some(
      (match) => Boolean(match.user) && !match.user.isActive
    )
  };
};

const listTenants = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search,
    status
  } = req.query;

  const query = {};

  if (status) {
    query.status = status;
  }

  if (search) {
    query.$or = [
      { slug: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } },
      { adminEmail: { $regex: search, $options: 'i' } }
    ];
  }

  const { Tenant } = req.platformModels;
  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const skip = (parsedPage - 1) * parsedLimit;

  const [items, total] = await Promise.all([
    Tenant.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean(),
    Tenant.countDocuments(query)
  ]);

  res.status(200).json({
    success: true,
    data: {
      items,
      total,
      page: parsedPage,
      pages: Math.ceil(total / parsedLimit) || 1,
      limit: parsedLimit
    }
  });
});

const getTenantById = asyncHandler(async (req, res) => {
  const { Tenant } = req.platformModels;
  const { id } = req.params;

  const tenant = await Tenant.findById(id).lean();

  if (!tenant) {
    return res.status(404).json({
      success: false,
      message: 'Tenant not found'
    });
  }

  return res.status(200).json({
    success: true,
    data: tenant
  });
});

const resolveTenantByEmail = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();

  if (!email) {
    return sendTenantResolveError(res, 400, 'Email is required');
  }

  const { Tenant } = req.platformModels;
  const { TenantUserDirectory } = req.platformModels;

  let resolvedTenantMatch = null;
  let inactiveTenantMatchFound = false;

  if (TenantUserDirectory) {
    const directoryMatches = await TenantUserDirectory.find({ email })
      .select('tenantSlug isActive')
      .lean();

    const activeDirectoryMatches = directoryMatches.filter((entry) => entry.isActive);
    inactiveTenantMatchFound = directoryMatches.some((entry) => !entry.isActive);

    if (activeDirectoryMatches.length > 0) {
      const matchedSlugs = [...new Set(activeDirectoryMatches.map((entry) => entry.tenantSlug))];
      const activeTenants = await Tenant.find({
        status: TENANT_STATUS.ACTIVE,
        slug: { $in: matchedSlugs }
      })
        .select('slug name dbName')
        .lean();

      const activeTenantBySlug = new Map(activeTenants.map((tenant) => [tenant.slug, tenant]));
      const firstMatch = activeDirectoryMatches.find(
        (entry) => activeTenantBySlug.has(entry.tenantSlug)
      );

      if (firstMatch) {
        resolvedTenantMatch = {
          tenantRecord: activeTenantBySlug.get(firstMatch.tenantSlug),
          user: { isActive: true }
        };
      }
    }
  }

  if (!resolvedTenantMatch && !inactiveTenantMatchFound) {
    const fallbackResolution = await resolveTenantByEmailFallbackScan({
      Tenant,
      email
    });
    resolvedTenantMatch = fallbackResolution.resolvedTenantMatch;
    inactiveTenantMatchFound = fallbackResolution.inactiveTenantMatchFound;
  }

  if (!resolvedTenantMatch) {
    if (inactiveTenantMatchFound) {
      return sendTenantResolveError(res, 403, 'User account is inactive');
    }

    return sendTenantResolveError(res, 404, 'No active user account found for this email');
  }

  return res.status(200).json({
    success: true,
    message: 'User account resolved successfully',
    data: {
      slug: resolvedTenantMatch.tenantRecord.slug,
      name: resolvedTenantMatch.tenantRecord.name
    }
  });
});

const lookupSchoolDirectoryByCode = asyncHandler(async (req, res) => {
  const schoolCode = String(req.params.schoolCode || '').trim().toUpperCase();
  const { MasterSchoolDirectory } = req.platformModels;

  const school = await MasterSchoolDirectory.findOne({
    schoolCode,
    isActive: true,
  })
    .select('schoolCode affiliationNo name')
    .lean();

  if (!school) {
    return res.status(404).json({
      success: false,
      message: 'No school found for this school code'
    });
  }

  return res.status(200).json({
    success: true,
    message: 'School fetched successfully',
    data: {
      schoolCode: school.schoolCode || '',
      affiliationNo: school.affiliationNo || '',
      name: school.name || ''
    }
  });
});

const createTenant = asyncHandler(async (req, res) => {
  const {
    slug,
    name,
    adminEmail,
    adminPassword,
    dbName
  } = req.body;

  if (!slug || !name || !adminEmail) {
    return res.status(400).json({
      success: false,
      message: 'slug, name and adminEmail are required'
    });
  }

  try {
    const result = await provisionTenant({
      slug,
      name,
      adminEmail,
      adminPassword,
      dbName,
      createdBy: req.platformUser?._id || null
    });

    await onboardTenantBillingBestEffort({
      tenant: result.tenant,
      tenantAdmin: result.tenantAdmin,
    });

    enqueueAdminNewTenantNotification({
      tenantName: result.tenant.name,
      tenantSlug: result.tenant.slug,
      adminEmail: result.tenant.adminEmail || adminEmail,
      source: 'admin'
    });

    return res.status(201).json({
      success: true,
      message: 'Tenant created successfully',
      data: {
        tenant: result.tenant,
        tenantAdmin: {
          id: result.tenantAdmin._id,
          email: result.tenantAdmin.email,
          role: result.tenantAdmin.role
        },
        generatedPassword: result.generatedPassword
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create tenant'
    });
  }
});

const startPublicTenantSignup = asyncHandler(async (req, res) => {
  const {
    udiseCode,
    slug,
    name,
    adminEmail,
    adminPassword
  } = req.body;
  const normalizedUdiseCode = String(udiseCode || '').trim();
  const normalizedSchoolName = String(name || '').trim();

  try {
    const result = await provisionTenant({
      slug,
      name: normalizedSchoolName,
      adminEmail,
      adminPassword,
      udiseCode: normalizedUdiseCode,
      createdBy: null
    });

    const ticketResult = await createOnboardingTicket({
      tenantSlug: result.tenant.slug,
      tenantAdminUserId: result.tenantAdmin._id,
      createdIp: getClientIp(req),
      createdUserAgent: req.headers['user-agent']
    });

    enqueueSignupOtpEmail({
      recipientEmail: adminEmail,
      tenantName: result.tenant.name,
      tenantSlug: result.tenant.slug,
      otpCode: ticketResult.emailOtpCode,
      otpExpiresAt: ticketResult.emailOtpExpiresAt,
      contextTag: 'start'
    });

    enqueueAdminNewTenantNotification({
      tenantName: result.tenant.name,
      tenantSlug: result.tenant.slug,
      adminEmail,
      source: 'public'
    });

    console.info(
      `[tenant-signup:start] status=success tenantSlug=${result.tenant.slug} otpDeliveryStatus=queued`
    );

    return res.status(201).json({
      success: true,
      message: 'Signup initiated successfully',
      data: {
        ticket: ticketResult.ticket,
        tenantSlug: result.tenant.slug,
        expiresAt: ticketResult.expiresAt,
        otpExpiresAt: ticketResult.emailOtpExpiresAt,
        otpDeliveryStatus: 'queued'
      }
    });
  } catch (error) {
    const errorCode = error.errorCode || 'signup_failed';
    const statusCode = error.statusCode || 500;

    if (errorCode === 'slug_taken') {
      console.info('[tenant-signup:start] status=conflict errorCode=slug_taken');
      return sendSignupError(
        res,
        409,
        'This user ID is already in use. Please choose another one.',
        'slug_taken'
      );
    }

    if (errorCode === 'admin_email_taken') {
      console.info('[tenant-signup:start] status=conflict errorCode=admin_email_taken');
      return sendSignupError(
        res,
        409,
        'The admin email is already in use. Please choose another one.',
        'admin_email_taken'
      );
    }

    console.error(
      `[tenant-signup:start] status=error errorCode=${errorCode} message=${error.message}`
    );

    return sendSignupError(
      res,
      statusCode,
      'Unable to complete signup right now. Please try again.',
      errorCode
    );
  }
});

const resendPublicTenantSignupOtp = asyncHandler(async (req, res) => {
  const { ticket, tenantSlug } = req.body;
  const { Tenant } = req.platformModels;

  const refreshResult = await refreshOnboardingTicketEmailOtp({
    ticket,
    expectedTenantSlug: tenantSlug
  });

  if (!refreshResult.success) {
    const reason = refreshResult.reason || TICKET_REASONS.INVALID;

    if (reason === TICKET_REASONS.EXPIRED) {
      return sendSignupError(
        res,
        410,
        'Signup session has expired. Please restart signup.',
        reason
      );
    }

    if (reason === TICKET_REASONS.USED) {
      return sendSignupError(
        res,
        409,
        'Signup session has already been used. Please restart signup.',
        reason
      );
    }

    return sendSignupError(
      res,
      400,
      'Invalid signup session. Please restart signup.',
      TICKET_REASONS.INVALID
    );
  }

  const tenantRecord = await Tenant.findOne({ slug: tenantSlug }).lean();
  if (!tenantRecord) {
    return sendSignupError(
      res,
      400,
      'Invalid signup session. Please restart signup.',
      TICKET_REASONS.INVALID
    );
  }

  enqueueSignupOtpEmail({
    recipientEmail: tenantRecord.adminEmail,
    tenantName: tenantRecord.name,
    tenantSlug: tenantRecord.slug,
    otpCode: refreshResult.emailOtpCode,
    otpExpiresAt: refreshResult.emailOtpExpiresAt,
    contextTag: 'resend-otp'
  });

  return res.status(200).json({
    success: true,
    message: 'Verification code queued successfully',
    data: {
      otpExpiresAt: refreshResult.emailOtpExpiresAt,
      otpDeliveryStatus: 'queued'
    }
  });
});

const exchangePublicTenantSignup = asyncHandler(async (req, res) => {
  const { ticket, tenantSlug, otp } = req.body;
  const { Tenant } = req.platformModels;

  const consumedTicket = await consumeOnboardingTicket({
    ticket,
    expectedTenantSlug: tenantSlug,
    emailOtp: otp
  });

  if (!consumedTicket.success) {
    const reason = consumedTicket.reason || TICKET_REASONS.INVALID;

    if (reason === TICKET_REASONS.EXPIRED) {
      console.info(`[tenant-signup:exchange] status=failed errorCode=${reason}`);
      return sendSignupError(
        res,
        410,
        'Signup session has expired. Please restart signup.',
        reason
      );
    }

    if (reason === TICKET_REASONS.USED) {
      console.info(`[tenant-signup:exchange] status=failed errorCode=${reason}`);
      return sendSignupError(
        res,
        409,
        'Signup session has already been used. Please restart signup.',
        reason
      );
    }

    if (reason === TICKET_REASONS.OTP_EXPIRED) {
      console.info(`[tenant-signup:exchange] status=failed errorCode=${reason}`);
      return sendSignupError(
        res,
        410,
        'Email verification code has expired. Please request a new code.',
        reason
      );
    }

    if (reason === TICKET_REASONS.OTP_REQUIRED) {
      console.info(`[tenant-signup:exchange] status=failed errorCode=${reason}`);
      return sendSignupError(
        res,
        400,
        'Email verification code is required to complete signup.',
        reason
      );
    }

    if (reason === TICKET_REASONS.OTP_ATTEMPTS_EXCEEDED) {
      console.info(`[tenant-signup:exchange] status=failed errorCode=${reason}`);
      return sendSignupError(
        res,
        429,
        'Too many incorrect verification attempts. Please request a new code.',
        reason
      );
    }

    if (reason === TICKET_REASONS.OTP_INVALID) {
      console.info(`[tenant-signup:exchange] status=failed errorCode=${reason}`);
      return sendSignupError(
        res,
        400,
        'Invalid email verification code. Please try again.',
        reason
      );
    }

    console.info(`[tenant-signup:exchange] status=failed errorCode=${reason}`);
    return sendSignupError(
      res,
      400,
      'Invalid signup session. Please restart signup.',
      TICKET_REASONS.INVALID
    );
  }

  const tenantRecord = await Tenant.findOne({ slug: tenantSlug });

  if (!tenantRecord || tenantRecord.status !== TENANT_STATUS.ACTIVE) {
    return sendSignupError(
      res,
      400,
      'Invalid signup session. Please restart signup.',
      TICKET_REASONS.INVALID
    );
  }

  const { models } = getTenantConnectionAndModels(tenantRecord.dbName, ['User', 'Role']);
  const user = await models.User.findById(consumedTicket.ticketRecord.tenantAdminUserId).select('+refreshTokens');

  if (!user || !user.isActive) {
    return sendSignupError(
      res,
      400,
      'Invalid signup session. Please restart signup.',
      TICKET_REASONS.INVALID
    );
  }

  // Mark email as verified since OTP was successfully validated
  user.isEmailVerified = true;
  if (!Array.isArray(user.roles) || user.roles.length === 0) user.roles = [ADMINISTRATOR_ROLE];
  // Signs the new admin in on this browser (httpOnly cookies; no tokens in the body).
  await issueSession({ req, res, user, tenantSlug: tenantRecord.slug, rememberMe: true });
  await onboardTenantBillingBestEffort({
    tenant: tenantRecord,
    tenantAdmin: user,
  });

  const billing = await buildBillingSnapshot(tenantRecord.slug);
  const userPayload = await buildAuthUserPayload(user, {
    models,
    tenant: {
      slug: tenantRecord.slug,
      name: tenantRecord.name,
      featureToggles: normalizeTenantFeatureToggles(tenantRecord.featureToggles),
    },
  });

  console.info(`[tenant-signup:exchange] status=success tenantSlug=${tenantRecord.slug}`);

  return res.status(200).json({
    success: true,
    message: 'Signup completed successfully',
    data: {
      user: { ...userPayload, billing },
      tenant: {
        slug: tenantRecord.slug,
        name: tenantRecord.name,
        status: tenantRecord.status
      },
      billing
    }
  });
});

const updateTenant = asyncHandler(async (req, res) => {
  const { Tenant } = req.platformModels;
  const { id } = req.params;
  const {
    name,
    adminEmail
  } = req.body;

  const tenant = await Tenant.findById(id);

  if (!tenant) {
    return res.status(404).json({
      success: false,
      message: 'Tenant not found'
    });
  }

  if (name !== undefined) {
    tenant.name = name;
  }

  if (adminEmail !== undefined) {
    tenant.adminEmail = adminEmail.toLowerCase();
  }

  await tenant.save();

  res.status(200).json({
    success: true,
    message: 'Tenant updated successfully',
    data: tenant
  });
});

const activateTenant = asyncHandler(async (req, res) => {
  const { Tenant } = req.platformModels;
  const { id } = req.params;

  const tenant = await Tenant.findByIdAndUpdate(
    id,
    { status: TENANT_STATUS.ACTIVE },
    { new: true }
  );

  if (!tenant) {
    return res.status(404).json({
      success: false,
      message: 'Tenant not found'
    });
  }

  res.status(200).json({
    success: true,
    message: 'Tenant activated',
    data: tenant
  });
});

const suspendTenant = asyncHandler(async (req, res) => {
  const { Tenant } = req.platformModels;
  const { id } = req.params;

  const tenant = await Tenant.findByIdAndUpdate(
    id,
    { status: TENANT_STATUS.SUSPENDED },
    { new: true }
  );

  if (!tenant) {
    return res.status(404).json({
      success: false,
      message: 'Tenant not found'
    });
  }

  res.status(200).json({
    success: true,
    message: 'Tenant suspended',
    data: tenant
  });
});

const deleteTenant = asyncHandler(async (req, res) => {
  const { Tenant } = req.platformModels;
  const { TenantOnboardingTicket } = req.platformModels;
  const { TenantUserDirectory } = req.platformModels;
  const { id } = req.params;
  const confirmationSlug = String(req.body.confirmSlug || '').trim().toLowerCase();

  const tenant = await Tenant.findById(id);

  if (!tenant) {
    return res.status(404).json({
      success: false,
      message: 'Tenant not found'
    });
  }

  if (confirmationSlug !== tenant.slug) {
    return res.status(400).json({
      success: false,
      message: 'Slug confirmation failed. Enter the exact tenant slug to continue.'
    });
  }

  const platformConnection = getPlatformConnection();

  try {
    // Remove from Mongoose cache before dropping to avoid stale model references
    removeTenantFromCache(tenant.dbName);

    // Use the native MongoDB client directly — more reliable than useDb().dropDatabase()
    const mongoClient = platformConnection.getClient();
    const nativeDb = mongoClient.db(tenant.dbName);
    await nativeDb.dropDatabase();

    const deleteDirectoryPromise = TenantUserDirectory
      ? TenantUserDirectory.deleteMany({ tenantSlug: tenant.slug })
      : Promise.resolve();

    await Promise.all([
      TenantOnboardingTicket.deleteMany({ tenantSlug: tenant.slug }),
      deleteDirectoryPromise,
      Tenant.findByIdAndDelete(tenant._id)
    ]);

    if (typeof platformConnection.removeDb === 'function') {
      try {
        platformConnection.removeDb(tenant.dbName);
      } catch {
        // Best effort cleanup. Database has already been dropped.
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Tenant deleted successfully',
      data: {
        _id: tenant._id,
        slug: tenant.slug,
        dbName: tenant.dbName
      }
    });
  } catch (err) {
    console.error(`[deleteTenant] Failed to delete tenant '${tenant.slug}' (db: ${tenant.dbName}):`, err);
    return res.status(500).json({
      success: false,
      message: `Failed to delete tenant database '${tenant.dbName}'. Tenant record was not removed.`
    });
  }
});

module.exports = {
  listTenants,
  getTenantById,
  resolveTenantByEmail,
  lookupSchoolDirectoryByCode,
  createTenant,
  startPublicTenantSignup,
  resendPublicTenantSignupOtp,
  exchangePublicTenantSignup,
  updateTenant,
  activateTenant,
  suspendTenant,
  deleteTenant
};

const mongoose = require('mongoose');
const { assertCopyTransition, workingDueAt, assertBorrowingEligibility } = require('../modules/libry/lifecycle');

const model = (req, key) => {
  const Model = req.models?.[key];
  if (!Model) throw Object.assign(new Error('Library is not enabled for this school.'), { statusCode: 503 });
  return Model;
};
const actor = (req) => String(req.user?.name || req.user?.email || '').trim();
const pageInfo = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  return { page, limit, skip: (page - 1) * limit };
};
const cleanList = (value) => Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
const fail = (res, error) => res.status(error.statusCode || (error.name === 'ValidationError' ? 400 : 500)).json({ success: false, message: error.message || 'Library request failed.' });
const recordAudit = async (req, action, entityType, entityId, detail = '') => {
  const Audit = req.models?.LibraryAuditLog;
  if (Audit) await Audit.create({ action, entityType, entityId: String(entityId || ''), actor: actor(req), detail });
};

exports.dashboard = async (req, res) => {
  try {
    const Title = model(req, 'LibraryTitle'); const Copy = model(req, 'LibraryCopy'); const Loan = model(req, 'LibraryLoan'); const Reservation = model(req, 'LibraryReservation'); const Request = model(req, 'LibraryAcquisitionRequest');
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0); const endOfDay = new Date(startOfDay); endOfDay.setDate(endOfDay.getDate() + 1);
    const [titles, copies, available, issued, lost, damaged, overdue, dueToday, reservations, pendingAcquisitions, todayIssues, todayReturns, recent] = await Promise.all([
      Title.countDocuments({ isActive: true }), Copy.countDocuments({ isActive: true }),
      Copy.countDocuments({ isActive: true, status: 'available' }), Copy.countDocuments({ isActive: true, status: 'issued' }),
      Copy.countDocuments({ isActive: true, status: 'lost' }), Copy.countDocuments({ isActive: true, status: 'damaged' }),
      Loan.countDocuments({ status: 'active', dueAt: { $lt: startOfDay } }), Loan.countDocuments({ status: 'active', dueAt: { $gte: startOfDay, $lt: endOfDay } }),
      Reservation.countDocuments({ status: 'queued' }), Request.countDocuments({ status: 'requested' }),
      Loan.countDocuments({ issuedAt: { $gte: startOfDay, $lt: endOfDay } }), Loan.countDocuments({ returnedAt: { $gte: startOfDay, $lt: endOfDay } }),
      Title.find({ isActive: true }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);
    res.json({ success: true, data: { titles, copies, available, issued, lost, damaged, overdue, dueToday, reservations, pendingAcquisitions, todayIssues, todayReturns, recent } });
  } catch (error) { fail(res, error); }
};

exports.listTitles = async (req, res) => {
  try {
    const Title = model(req, 'LibraryTitle'); const Copy = model(req, 'LibraryCopy'); const { page, limit, skip } = pageInfo(req.query);
    const filter = { isActive: true }; const q = String(req.query.q || '').trim();
    if (q) { const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); filter.$or = [{ title: rx }, { subtitle: rx }, { authors: rx }, { isbn13: rx }, { subjects: rx }]; }
    if (req.query.type) filter.resourceType = req.query.type;
    const [items, total] = await Promise.all([Title.find(filter).sort({ title: 1 }).skip(skip).limit(limit).lean(), Title.countDocuments(filter)]);
    const counts = await Copy.aggregate([{ $match: { isActive: true, titleId: { $in: items.map((item) => item._id) } } }, { $group: { _id: '$titleId', copies: { $sum: 1 }, available: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } } } }]);
    const summary = new Map(counts.map((count) => [String(count._id), count]));
    res.json({ success: true, data: { items: items.map((item) => ({ ...item, inventory: summary.get(String(item._id)) || { copies: 0, available: 0 } })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
  } catch (error) { fail(res, error); }
};

exports.lookupTitle = async (req, res) => {
  try {
    const code = String(req.query.code || '').trim(); if (!code) throw Object.assign(new Error('Enter or scan an ISBN.'), { statusCode: 400 });
    const Title = model(req, 'LibraryTitle'); const item = await Title.findOne({ isActive: true, isbn13: code }).lean();
    if (!item) throw Object.assign(new Error('No catalogue title matches this ISBN. Add the title manually before registering stock.'), { statusCode: 404 }); res.json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.createTitle = async (req, res) => {
  try {
    const Title = model(req, 'LibraryTitle'); const body = req.body || {}; const user = actor(req);
    const item = await Title.create({ title: body.title, subtitle: body.subtitle, authors: cleanList(body.authors), isbn13: body.isbn13, publisher: body.publisher, publicationYear: body.publicationYear || null, language: body.language || 'English', subjects: cleanList(body.subjects), classificationCode: body.classificationCode, description: body.description, resourceType: body.resourceType || 'physical', createdBy: user, updatedBy: user });
    res.status(201).json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.updateTitle = async (req, res) => {
  try {
    const Title = model(req, 'LibraryTitle'); const body = req.body || {}; const patch = { ...body, updatedBy: actor(req) };
    if (body.authors !== undefined) patch.authors = cleanList(body.authors); if (body.subjects !== undefined) patch.subjects = cleanList(body.subjects);
    const item = await Title.findOneAndUpdate({ _id: req.params.id, isActive: true }, patch, { new: true, runValidators: true });
    if (!item) throw Object.assign(new Error('Title not found.'), { statusCode: 404 });
    res.json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.listCopies = async (req, res) => {
  try {
    const Copy = model(req, 'LibraryCopy'); const { page, limit, skip } = pageInfo(req.query); const filter = { isActive: true };
    if (req.query.status) filter.status = req.query.status; if (req.query.titleId && mongoose.Types.ObjectId.isValid(req.query.titleId)) filter.titleId = req.query.titleId;
    const [items, total] = await Promise.all([Copy.find(filter).populate('titleId', 'title authors isbn13').sort({ accessionNumber: 1 }).skip(skip).limit(limit).lean(), Copy.countDocuments(filter)]);
    res.json({ success: true, data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
  } catch (error) { fail(res, error); }
};

exports.lookupCopy = async (req, res) => {
  try {
    const code = String(req.query.code || '').trim(); if (!code) throw Object.assign(new Error('Enter or scan a copy barcode or accession number.'), { statusCode: 400 });
    const Copy = model(req, 'LibraryCopy'); const item = await Copy.findOne({ isActive: true, $or: [{ barcode: code }, { accessionNumber: code }] }).populate('titleId', 'title authors isbn13').lean();
    if (!item) throw Object.assign(new Error('No library copy matches this barcode.'), { statusCode: 404 }); res.json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.createCopy = async (req, res) => {
  try {
    const Copy = model(req, 'LibraryCopy'); const Title = model(req, 'LibraryTitle'); const body = req.body || {}; const user = actor(req);
    if (!mongoose.Types.ObjectId.isValid(body.titleId) || !await Title.exists({ _id: body.titleId, isActive: true })) {
      throw Object.assign(new Error('Choose an active catalogue title before adding a copy.'), { statusCode: 400 });
    }
    const item = await Copy.create({ titleId: body.titleId, accessionNumber: body.accessionNumber, barcode: body.barcode, shelfLocation: body.shelfLocation, condition: body.condition || 'good', status: body.status || 'available', acquiredOn: body.acquiredOn || null, price: body.price || null, supplier: body.supplier, note: body.note, createdBy: user, updatedBy: user });
    res.status(201).json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.bulkCreateCopies = async (req, res) => {
  const session = await model(req, 'LibraryCopy').db.startSession();
  try {
    const Copy = model(req, 'LibraryCopy'); const Title = model(req, 'LibraryTitle'); const body = req.body || {}; const copies = Array.isArray(body.copies) ? body.copies : [];
    if (!mongoose.Types.ObjectId.isValid(body.titleId) || !await Title.exists({ _id: body.titleId, isActive: true }).session(session)) throw Object.assign(new Error('Choose an active catalogue title.'), { statusCode: 400 });
    if (!copies.length || copies.length > 500) throw Object.assign(new Error('Register between 1 and 500 copies at a time.'), { statusCode: 400 });
    const accessionNumbers = copies.map((copy) => String(copy.accessionNumber || '').trim()); const barcodes = copies.map((copy) => String(copy.barcode || '').trim()).filter(Boolean);
    if (accessionNumbers.some((value) => !value) || new Set(accessionNumbers).size !== accessionNumbers.length) throw Object.assign(new Error('Every copy needs a distinct accession number.'), { statusCode: 400 });
    if (new Set(barcodes).size !== barcodes.length) throw Object.assign(new Error('Copy barcodes must be unique within this batch.'), { statusCode: 400 });
    let created;
    await session.withTransaction(async () => { created = await Copy.insertMany(copies.map((copy) => ({ titleId: body.titleId, accessionNumber: String(copy.accessionNumber).trim(), barcode: String(copy.barcode || '').trim() || null, shelfLocation: copy.shelfLocation || body.shelfLocation || '', condition: 'new', status: 'available', acquiredOn: copy.acquiredOn || body.acquiredOn || new Date(), price: copy.price ?? body.price ?? null, supplier: copy.supplier || body.supplier || '', note: copy.note || body.note || '', createdBy: actor(req), updatedBy: actor(req) })), { session, ordered: true }); });
    await recordAudit(req, 'copies.bulk_registered', 'library_copy', body.titleId, `${created.length} copies registered`); res.status(201).json({ success: true, data: { copies: created, summary: { copiesRegistered: created.length, skipped: 0 } } });
  } catch (error) { fail(res, error); } finally { await session.endSession(); }
};

exports.updateCopy = async (req, res) => {
  try {
    const Copy = model(req, 'LibraryCopy'); const item = await Copy.findOne({ _id: req.params.id, isActive: true });
    if (item && req.body?.status) assertCopyTransition(item.status, req.body.status);
    if (item) {
      ['barcode', 'shelfLocation', 'condition', 'status', 'price', 'supplier', 'note'].forEach((field) => { if (req.body?.[field] !== undefined) item[field] = req.body[field]; });
      item.updatedBy = actor(req); await item.save();
    }
    if (!item) throw Object.assign(new Error('Copy not found.'), { statusCode: 404 }); res.json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.listMembers = async (req, res) => {
  try {
    const Member = model(req, 'LibraryMember'); const q = String(req.query.q || '').trim(); const filter = { isActive: true };
    if (q) { const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); filter.$or = [{ name: rx }, { memberId: rx }, { className: rx }]; }
    res.json({ success: true, data: { items: await Member.find(filter).sort({ name: 1 }).limit(100).lean() } });
  } catch (error) { fail(res, error); }
};

exports.lookupMember = async (req, res) => {
  try {
    const code = String(req.query.code || '').trim(); if (!code) throw Object.assign(new Error('Enter or scan a borrower ID.'), { statusCode: 400 });
    const Member = model(req, 'LibraryMember'); const Loan = model(req, 'LibraryLoan'); const Policy = model(req, 'LibraryPolicy'); const member = await Member.findOne({ memberId: code, isActive: true }).lean();
    if (!member) throw Object.assign(new Error('No active library member matches this ID.'), { statusCode: 404 }); const [activeLoans, policy] = await Promise.all([Loan.countDocuments({ memberId: member._id, status: 'active' }), Policy.findOne({ memberType: member.memberType, isActive: true }).lean()]);
    res.json({ success: true, data: { member, activeLoans, policy, eligible: member.status === 'active' && Boolean(policy) && activeLoans < (policy?.maxActiveLoans || 0) } });
  } catch (error) { fail(res, error); }
};

exports.upsertMember = async (req, res) => {
  try {
    const Member = model(req, 'LibraryMember'); const body = req.body || {}; const user = actor(req);
    const item = await Member.findOneAndUpdate({ memberType: body.memberType, memberId: String(body.memberId || '').trim() }, { ...body, updatedBy: user, createdBy: user, isActive: true }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
    res.status(201).json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.listPolicies = async (req, res) => {
  try { const Policy = model(req, 'LibraryPolicy'); res.json({ success: true, data: await Policy.find({ isActive: true }).sort({ memberType: 1 }).lean() }); } catch (error) { fail(res, error); }
};

exports.savePolicy = async (req, res) => {
  try {
    const Policy = model(req, 'LibraryPolicy'); const body = req.body || {};
    const item = await Policy.findOneAndUpdate({ memberType: body.memberType }, { memberType: body.memberType, maxActiveLoans: body.maxActiveLoans, loanDays: body.loanDays, maxRenewals: body.maxRenewals, isActive: true, updatedBy: actor(req) }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
    res.json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.listLoans = async (req, res) => {
  try {
    const Loan = model(req, 'LibraryLoan'); const filter = req.query.status === 'returned' ? { status: 'returned' } : { status: 'active' };
    const items = await Loan.find(filter).populate('copyId', 'accessionNumber barcode status titleId').populate({ path: 'copyId', populate: { path: 'titleId', select: 'title authors' } }).populate('memberId', 'name memberType memberId className section').sort({ dueAt: 1 }).limit(200).lean();
    res.json({ success: true, data: { items } });
  } catch (error) { fail(res, error); }
};

exports.issueLoan = async (req, res) => {
  const session = await model(req, 'LibraryCopy').db.startSession();
  try {
    const Copy = model(req, 'LibraryCopy'); const Member = model(req, 'LibraryMember'); const Policy = model(req, 'LibraryPolicy'); const Loan = model(req, 'LibraryLoan'); const body = req.body || {}; let loan;
    await session.withTransaction(async () => {
      const member = await Member.findOne({ _id: body.memberId, isActive: true, status: 'active' }).session(session);
      if (!member) throw Object.assign(new Error('Member is not active.'), { statusCode: 400 });
      const policy = await Policy.findOne({ memberType: member.memberType, isActive: true }).session(session);
      const activeLoans = await Loan.countDocuments({ memberId: member._id, status: 'active' }).session(session);
      assertBorrowingEligibility({ member, policy, activeLoans });
      const copy = await Copy.findOneAndUpdate({ _id: body.copyId, isActive: true, status: 'available' }, { status: 'issued', updatedBy: actor(req) }, { new: true, session });
      if (!copy) throw Object.assign(new Error('This copy is not available to issue.'), { statusCode: 409 });
      const dueAt = await workingDueAt(req.models, new Date(), policy.loanDays);
      [loan] = await Loan.create([{ copyId: copy._id, memberId: member._id, dueAt, issuedBy: actor(req) }], { session });
    });
    res.status(201).json({ success: true, data: loan });
  } catch (error) { fail(res, error); } finally { await session.endSession(); }
};

exports.returnLoan = async (req, res) => {
  const session = await model(req, 'LibraryCopy').db.startSession();
  try {
    const Loan = model(req, 'LibraryLoan'); const Copy = model(req, 'LibraryCopy'); let loan;
    await session.withTransaction(async () => {
      loan = await Loan.findOneAndUpdate({ _id: req.params.id, status: 'active' }, { status: 'returned', returnedAt: new Date(), returnedBy: actor(req) }, { new: true, session });
      if (!loan) throw Object.assign(new Error('Active loan not found.'), { statusCode: 404 });
      await Copy.findByIdAndUpdate(loan.copyId, { status: 'available', updatedBy: actor(req) }, { session });
    });
    res.json({ success: true, data: loan });
  } catch (error) { fail(res, error); } finally { await session.endSession(); }
};

exports.returnByBarcode = async (req, res) => {
  const session = await model(req, 'LibraryCopy').db.startSession();
  try {
    const Copy = model(req, 'LibraryCopy'); const Loan = model(req, 'LibraryLoan'); const code = String(req.body?.code || '').trim(); const condition = String(req.body?.condition || 'good'); if (!code) throw Object.assign(new Error('Enter or scan a copy barcode.'), { statusCode: 400 }); let loan;
    await session.withTransaction(async () => {
      const copy = await Copy.findOne({ isActive: true, $or: [{ barcode: code }, { accessionNumber: code }] }).session(session); if (!copy) throw Object.assign(new Error('No library copy matches this barcode.'), { statusCode: 404 });
      loan = await Loan.findOneAndUpdate({ copyId: copy._id, status: 'active' }, { status: 'returned', returnedAt: new Date(), returnedBy: actor(req) }, { new: true, session }); if (!loan) throw Object.assign(new Error('This copy does not have an active loan.'), { statusCode: 409 });
      copy.condition = condition === 'damaged' ? 'damaged' : copy.condition; copy.status = condition === 'requires_inspection' ? 'inspection' : condition === 'damaged' ? 'damaged' : 'available'; copy.updatedBy = actor(req); await copy.save({ session });
    });
    await recordAudit(req, 'loan.returned_by_scan', 'loan', loan._id, `Condition: ${condition}`); res.json({ success: true, data: loan });
  } catch (error) { fail(res, error); } finally { await session.endSession(); }
};

exports.renewLoan = async (req, res) => {
  try {
    const Loan = model(req, 'LibraryLoan'); const Policy = model(req, 'LibraryPolicy'); const Member = model(req, 'LibraryMember'); const loan = await Loan.findOne({ _id: req.params.id, status: 'active' }).populate('memberId');
    if (!loan) throw Object.assign(new Error('Active loan not found.'), { statusCode: 404 }); const policy = await Policy.findOne({ memberType: loan.memberId.memberType, isActive: true });
    if (!policy || loan.renewals >= policy.maxRenewals) throw Object.assign(new Error('This loan cannot be renewed under the current policy.'), { statusCode: 400 });
    loan.renewals += 1; loan.dueAt = await workingDueAt(req.models, new Date(), policy.loanDays); await loan.save(); res.json({ success: true, data: loan });
  } catch (error) { fail(res, error); }
};

exports.listReservations = async (req, res) => {
  try { const Reservation = model(req, 'LibraryReservation'); const items = await Reservation.find({ status: 'queued' }).populate('titleId', 'title authors').populate('memberId', 'name memberType').sort({ createdAt: 1 }).lean(); res.json({ success: true, data: { items } }); } catch (error) { fail(res, error); }
};

exports.createReservation = async (req, res) => {
  try {
    const Reservation = model(req, 'LibraryReservation'); const { titleId, memberId } = req.body || {}; const duplicate = await Reservation.exists({ titleId, memberId, status: 'queued' });
    if (duplicate) throw Object.assign(new Error('This member already has an active reservation for this title.'), { statusCode: 409 });
    const item = await Reservation.create({ titleId, memberId, createdBy: actor(req) }); res.status(201).json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.listFines = async (req, res) => {
  try { const Fine = model(req, 'LibraryFine'); const items = await Fine.find({}).populate('memberId', 'name memberType').populate('loanId', 'dueAt').sort({ createdAt: -1 }).lean(); res.json({ success: true, data: { items } }); } catch (error) { fail(res, error); }
};

exports.assessFine = async (req, res) => {
  try {
    const Fine = model(req, 'LibraryFine'); const Member = model(req, 'LibraryMember'); const Loan = model(req, 'LibraryLoan'); const body = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(body.memberId) || !await Member.exists({ _id: body.memberId, isActive: true })) throw Object.assign(new Error('Choose an active library member.'), { statusCode: 400 });
    if (body.loanId && (!mongoose.Types.ObjectId.isValid(body.loanId) || !await Loan.exists({ _id: body.loanId }))) throw Object.assign(new Error('Selected loan was not found.'), { statusCode: 400 });
    const item = await Fine.create({ memberId: body.memberId, loanId: body.loanId || null, kind: body.kind, amount: body.amount, outstandingAmount: body.amount, reason: body.reason, assessedBy: actor(req) });
    res.status(201).json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.waiveFine = async (req, res) => {
  try {
    const Fine = model(req, 'LibraryFine'); const item = await Fine.findOne({ _id: req.params.id, status: 'open' });
    if (!item) throw Object.assign(new Error('An open fine was not found.'), { statusCode: 404 });
    item.status = 'waived'; item.outstandingAmount = 0; item.waivedBy = actor(req); item.waiverReason = String(req.body?.reason || '').trim();
    if (!item.waiverReason) throw Object.assign(new Error('A reason is required to waive a fine.'), { statusCode: 400 });
    await item.save(); res.json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.listAcquisitionRequests = async (req, res) => {
  try { const Request = model(req, 'LibraryAcquisitionRequest'); const items = await Request.find({}).sort({ createdAt: -1 }).lean(); res.json({ success: true, data: { items } }); } catch (error) { fail(res, error); }
};

exports.createAcquisitionRequest = async (req, res) => {
  try {
    const Request = model(req, 'LibraryAcquisitionRequest'); const body = req.body || {}; const item = await Request.create({ title: body.title, author: body.author, isbn13: body.isbn13, quantity: body.quantity, estimatedUnitCost: body.estimatedUnitCost || null, purpose: body.purpose, requestedBy: actor(req) });
    res.status(201).json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.reviewAcquisitionRequest = async (req, res) => {
  try {
    const Request = model(req, 'LibraryAcquisitionRequest'); const decision = String(req.body?.decision || ''); const reviewer = actor(req); const item = await Request.findOne({ _id: req.params.id, status: 'requested' });
    if (!item) throw Object.assign(new Error('A pending acquisition request was not found.'), { statusCode: 404 });
    if (item.requestedBy === reviewer) throw Object.assign(new Error('The requester cannot approve or reject their own request.'), { statusCode: 403 });
    if (!['approved', 'rejected'].includes(decision)) throw Object.assign(new Error('Choose approve or reject.'), { statusCode: 400 });
    item.status = decision; item.reviewedBy = reviewer; item.reviewNote = String(req.body?.note || '').trim(); await item.save(); res.json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.listSuppliers = async (req, res) => {
  try { const Supplier = model(req, 'LibrarySupplier'); res.json({ success: true, data: { items: await Supplier.find({ isActive: true }).sort({ name: 1 }).lean() } }); } catch (error) { fail(res, error); }
};

exports.createSupplier = async (req, res) => {
  try { const Supplier = model(req, 'LibrarySupplier'); const item = await Supplier.create({ ...req.body, createdBy: actor(req) }); res.status(201).json({ success: true, data: item }); } catch (error) { fail(res, error); }
};

exports.listPurchaseOrders = async (req, res) => {
  try { const PurchaseOrder = model(req, 'LibraryPurchaseOrder'); const items = await PurchaseOrder.find({}).populate('supplierId', 'name').sort({ createdAt: -1 }).lean(); res.json({ success: true, data: { items } }); } catch (error) { fail(res, error); }
};

exports.createPurchaseOrder = async (req, res) => {
  try {
    const PurchaseOrder = model(req, 'LibraryPurchaseOrder'); const Supplier = model(req, 'LibrarySupplier'); const body = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(body.supplierId) || !await Supplier.exists({ _id: body.supplierId, isActive: true })) throw Object.assign(new Error('Choose an active supplier.'), { statusCode: 400 });
    const lines = Array.isArray(body.lines) ? body.lines : []; if (!lines.length) throw Object.assign(new Error('Add at least one purchase-order line.'), { statusCode: 400 });
    const number = String(body.number || `LIB-${Date.now()}`).trim(); const item = await PurchaseOrder.create({ number, supplierId: body.supplierId, requestId: body.requestId || null, lines, status: 'ordered', orderedAt: new Date(), createdBy: actor(req) });
    res.status(201).json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.receivePurchaseOrder = async (req, res) => {
  const session = await model(req, 'LibraryCopy').db.startSession();
  try {
    const PurchaseOrder = model(req, 'LibraryPurchaseOrder'); const Receipt = model(req, 'LibraryGoodsReceipt'); const Copy = model(req, 'LibraryCopy'); const Title = model(req, 'LibraryTitle'); const body = req.body || {}; let receipt;
    await session.withTransaction(async () => {
      const order = await PurchaseOrder.findOne({ _id: req.params.id, status: { $in: ['ordered', 'partially_received'] } }).session(session);
      if (!order) throw Object.assign(new Error('An open purchase order was not found.'), { statusCode: 404 });
      const copies = Array.isArray(body.copies) ? body.copies : []; if (!copies.length) throw Object.assign(new Error('Enter at least one received copy with an accession number.'), { statusCode: 400 });
      const created = [];
      for (const entry of copies) {
        if (!mongoose.Types.ObjectId.isValid(entry.titleId) || !await Title.exists({ _id: entry.titleId, isActive: true }).session(session)) throw Object.assign(new Error('Each received copy needs a valid catalogue title.'), { statusCode: 400 });
        const copy = await Copy.create([{ titleId: entry.titleId, accessionNumber: entry.accessionNumber, barcode: entry.barcode || '', shelfLocation: entry.shelfLocation || '', condition: 'new', status: 'available', acquiredOn: new Date(), price: entry.price || null, supplier: String(order.supplierId), note: `Received against ${order.number}`, createdBy: actor(req), updatedBy: actor(req) }], { session });
        created.push({ copyId: copy[0]._id, accessionNumber: copy[0].accessionNumber });
      }
      const remaining = order.lines.reduce((total, line) => total + Math.max(0, line.quantity - line.receivedQuantity), 0);
      if (created.length > remaining) throw Object.assign(new Error('Received copy count exceeds the outstanding purchase-order quantity.'), { statusCode: 400 });
      // Copies that name their order line count against it; otherwise they fill the lines in order.
      if (copies.every((entry) => entry.lineId)) {
        for (const entry of copies) {
          const line = order.lines.find((row) => String(row._id) === String(entry.lineId));
          if (!line) throw Object.assign(new Error('A received copy names a line that is not on this order.'), { statusCode: 400 });
          if (line.receivedQuantity >= line.quantity) throw Object.assign(new Error(`More copies of ${line.title} than were ordered.`), { statusCode: 400 });
          line.receivedQuantity += 1;
        }
      } else {
        let toAllocate = created.length;
        for (const line of order.lines) { if (!toAllocate) break; const available = line.quantity - line.receivedQuantity; const add = Math.min(available, toAllocate); line.receivedQuantity += add; toAllocate -= add; }
      }
      order.status = order.lines.every((line) => line.receivedQuantity >= line.quantity) ? 'received' : 'partially_received'; await order.save({ session });
      [receipt] = await Receipt.create([{ purchaseOrderId: order._id, receivedBy: actor(req), copies: created }], { session });
    });
    await recordAudit(req, 'purchase_order.received', 'purchase_order', req.params.id, `${receipt.copies.length} copy/copies received`);
    res.status(201).json({ success: true, data: receipt });
  } catch (error) { fail(res, error); } finally { await session.endSession(); }
};

exports.getReport = async (req, res) => {
  try {
    const Copy = model(req, 'LibraryCopy'); const Loan = model(req, 'LibraryLoan'); const Fine = model(req, 'LibraryFine'); const type = String(req.params.type || 'inventory'); const now = new Date();
    if (type === 'inventory') {
      const rows = await Copy.aggregate([{ $match: { isActive: true } }, { $group: { _id: '$status', copies: { $sum: 1 }, value: { $sum: '$price' } } }, { $sort: { _id: 1 } }]);
      return res.json({ success: true, data: { type, rows } });
    }
    if (type === 'overdue') {
      const rows = await Loan.find({ status: 'active', dueAt: { $lt: now } }).populate('memberId', 'name memberType').populate({ path: 'copyId', select: 'accessionNumber titleId', populate: { path: 'titleId', select: 'title' } }).sort({ dueAt: 1 }).lean();
      return res.json({ success: true, data: { type, rows } });
    }
    if (type === 'fines') {
      const rows = await Fine.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, outstanding: { $sum: '$outstandingAmount' } } }, { $sort: { _id: 1 } }]);
      return res.json({ success: true, data: { type, rows } });
    }
    throw Object.assign(new Error('Unknown library report.'), { statusCode: 404 });
  } catch (error) { fail(res, error); }
};

exports.listStocktakes = async (req, res) => {
  try { const Stocktake = model(req, 'LibraryStocktake'); res.json({ success: true, data: { items: await Stocktake.find({}).sort({ createdAt: -1 }).limit(50).lean() } }); } catch (error) { fail(res, error); }
};

exports.startStocktake = async (req, res) => {
  try {
    const Stocktake = model(req, 'LibraryStocktake'); const Copy = model(req, 'LibraryCopy'); const copies = await Copy.find({ isActive: true, status: { $nin: ['withdrawn'] } }).select('_id accessionNumber status').lean();
    const item = await Stocktake.create({ name: req.body?.name || `Stocktake ${new Date().toLocaleDateString('en-CA')}`, startedBy: actor(req), items: copies.map((copy) => ({ copyId: copy._id, accessionNumber: copy.accessionNumber, expectedStatus: copy.status })) });
    await recordAudit(req, 'stocktake.started', 'stocktake', item._id, `${copies.length} copies included`); res.status(201).json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.scanStocktakeItem = async (req, res) => {
  try {
    const Stocktake = model(req, 'LibraryStocktake'); const code = String(req.body?.code || '').trim(); const item = await Stocktake.findOne({ _id: req.params.id, status: 'open' });
    if (!item) throw Object.assign(new Error('Open stocktake not found.'), { statusCode: 404 }); const row = item.items.find((entry) => entry.accessionNumber === code);
    if (!row) throw Object.assign(new Error('This accession number is not in the stocktake.'), { statusCode: 404 }); row.state = 'verified'; row.scannedAt = new Date(); await item.save(); res.json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.closeStocktake = async (req, res) => {
  try {
    const Stocktake = model(req, 'LibraryStocktake'); const item = await Stocktake.findOne({ _id: req.params.id, status: 'open' }); if (!item) throw Object.assign(new Error('Open stocktake not found.'), { statusCode: 404 });
    item.items.forEach((entry) => { if (entry.state === 'pending') entry.state = 'missing'; }); item.status = 'closed'; item.closedBy = actor(req); item.closedAt = new Date(); await item.save();
    await recordAudit(req, 'stocktake.closed', 'stocktake', item._id, `${item.items.filter((entry) => entry.state === 'missing').length} missing copies`); res.json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.listAudit = async (req, res) => {
  try { const Audit = model(req, 'LibraryAuditLog'); res.json({ success: true, data: { items: await Audit.find({}).sort({ createdAt: -1 }).limit(200).lean() } }); } catch (error) { fail(res, error); }
};

exports.listDigitalResources = async (req, res) => {
  try {
    const Resource = model(req, 'LibraryDigitalResource'); const now = new Date(); const filter = { status: 'active', $and: [{ $or: [{ accessStartsAt: null }, { accessStartsAt: { $lte: now } }] }, { $or: [{ accessEndsAt: null }, { accessEndsAt: { $gte: now } }] }] };
    res.json({ success: true, data: { items: await Resource.find(filter).sort({ title: 1 }).lean() } });
  } catch (error) { fail(res, error); }
};

exports.createDigitalResource = async (req, res) => {
  try {
    const body = req.body || {}; let parsed; try { parsed = new URL(String(body.url || '')); } catch (_) { throw Object.assign(new Error('Enter a valid HTTPS resource URL.'), { statusCode: 400 }); }
    if (parsed.protocol !== 'https:') throw Object.assign(new Error('Digital resources must use HTTPS URLs.'), { statusCode: 400 });
    const Resource = model(req, 'LibraryDigitalResource'); const item = await Resource.create({ ...body, authors: cleanList(body.authors), createdBy: actor(req) }); await recordAudit(req, 'digital_resource.created', 'digital_resource', item._id, item.title); res.status(201).json({ success: true, data: item });
  } catch (error) { fail(res, error); }
};

exports.listReadingLists = async (req, res) => {
  try { const ReadingList = model(req, 'LibraryReadingList'); const items = await ReadingList.find({}).populate('items.titleId', 'title authors').populate('items.digitalResourceId', 'title resourceType').sort({ createdAt: -1 }).lean(); res.json({ success: true, data: { items } }); } catch (error) { fail(res, error); }
};

exports.createReadingList = async (req, res) => {
  try { const ReadingList = model(req, 'LibraryReadingList'); const item = await ReadingList.create({ title: req.body?.title, description: req.body?.description, audience: req.body?.audience || 'students', items: Array.isArray(req.body?.items) ? req.body.items : [], createdBy: actor(req) }); res.status(201).json({ success: true, data: item }); } catch (error) { fail(res, error); }
};

exports.createReadingLog = async (req, res) => {
  try { const Log = model(req, 'LibraryReadingLog'); const Member = model(req, 'LibraryMember'); const body = req.body || {}; if (!await Member.exists({ _id: body.memberId, isActive: true })) throw Object.assign(new Error('Choose an active library member.'), { statusCode: 400 }); const item = await Log.create(body); res.status(201).json({ success: true, data: item }); } catch (error) { fail(res, error); }
};

exports.listReviews = async (req, res) => {
  try { const Review = model(req, 'LibraryBookReview'); const items = await Review.find({}).populate('memberId', 'name memberType').populate('titleId', 'title authors').sort({ createdAt: -1 }).lean(); res.json({ success: true, data: { items } }); } catch (error) { fail(res, error); }
};

exports.moderateReview = async (req, res) => {
  try { const Review = model(req, 'LibraryBookReview'); const status = String(req.body?.status || ''); if (!['published', 'rejected'].includes(status)) throw Object.assign(new Error('Choose publish or reject.'), { statusCode: 400 }); const item = await Review.findOneAndUpdate({ _id: req.params.id, status: 'pending' }, { status, moderatedBy: actor(req) }, { new: true }); if (!item) throw Object.assign(new Error('Pending review not found.'), { statusCode: 404 }); res.json({ success: true, data: item }); } catch (error) { fail(res, error); }
};

exports.listChallenges = async (req, res) => {
  try { const Challenge = model(req, 'LibraryReadingChallenge'); res.json({ success: true, data: { items: await Challenge.find({ isActive: true }).sort({ endsAt: 1 }).lean() } }); } catch (error) { fail(res, error); }
};

exports.createChallenge = async (req, res) => {
  try { const Challenge = model(req, 'LibraryReadingChallenge'); const body = req.body || {}; if (new Date(body.endsAt) <= new Date(body.startsAt)) throw Object.assign(new Error('Challenge end date must be after its start date.'), { statusCode: 400 }); const item = await Challenge.create({ ...body, createdBy: actor(req) }); res.status(201).json({ success: true, data: item }); } catch (error) { fail(res, error); }
};

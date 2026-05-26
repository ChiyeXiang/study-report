const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const APP_ORIGIN = process.env.APP_ORIGIN || '*';
const JWT_SECRET = requireEnv('JWT_SECRET');
const DASHSCOPE_API_KEY = requireEnv('DASHSCOPE_API_KEY');
const DASHSCOPE_API_BASE = process.env.DASHSCOPE_BASE_URL || process.env.DASHSCOPE_API_BASE || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DASHSCOPE_MODEL = process.env.LLM_MODEL || process.env.DASHSCOPE_MODEL || 'qwen-plus';
const LIZHIHUI_CLIENT_SECRET = process.env.LIZHIHUI_SIGNING_SECRET || process.env.LIZHIHUI_CLIENT_SECRET || '';
const SMS_PROVIDER = process.env.SMS_PROVIDER || 'mock';

let pool;

main().catch(error => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const mysql = require('mysql2/promise');
  pool = mysql.createPool({
    ...buildDatabaseConfig(),
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    timezone: '+08:00',
    namedPlaceholders: true,
    decimalNumbers: true,
  });
  await initSchema();
  await seedBaseData();

  if (process.env.SKIP_LISTEN !== '1') {
    http.createServer(route).listen(PORT, HOST, () => {
      console.log(`GPN backend listening on http://${HOST}:${PORT}`);
    });
  }
}

async function route(req, res) {
  try {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') return sendJson(res, 204, {});

    const url = new URL(req.url, `http://${req.headers.host}`);
    const routeKey = `${req.method} ${url.pathname}`;

    if (routeKey === 'GET /api/health') return sendJson(res, 200, { ok: true, service: 'gpn-backend', db: 'mysql' });

    if (routeKey === 'POST /api/v1/auth/check-phone') return checkPhoneRegistered(res, await readJson(req));
    if (routeKey === 'POST /api/v1/auth/send-code') return sendVerificationCode(req, res, await readJson(req));
    if (routeKey === 'POST /api/v1/auth/verify-code') return verifyCodeOnly(res, await readJson(req));
    if (routeKey === 'POST /api/v1/auth/register') return registerUser(res, await readJson(req));
    if (routeKey === 'POST /api/v1/auth/login') return loginUser(res, await readJson(req));
    if (routeKey === 'GET /api/v1/me') return getMe(req, res);

    if (routeKey === 'GET /api/v1/account/summary') return getAccountSummary(req, res);
    if (routeKey === 'GET /api/v1/report-types') return listReportTypes(res);
    if (routeKey === 'POST /api/v1/ai/qwen-json') return qwenJsonProxy(req, res, await readJson(req));

    if (routeKey === 'POST /api/v1/questionnaire-submissions') return submitQuestionnaire(req, res, await readJson(req));
    if (routeKey === 'POST /api/v1/reports') return createReportJob(req, res, await readJson(req));
    if (routeKey === 'GET /api/v1/reports') return listUserReports(req, res);
    if (req.method === 'GET' && url.pathname.startsWith('/api/v1/reports/')) return getUserReport(req, res, url.pathname.split('/').pop());
    if (req.method === 'GET' && url.pathname.startsWith('/api/v1/report-jobs/')) return getReportJob(req, res, url.pathname.split('/').pop());

    if (routeKey === 'GET /api/v1/entitlements') return listUserEntitlements(req, res);
    if (routeKey === 'POST /api/v1/entitlements/redeem') return redeemEntitlementForReport(req, res, await readJson(req));

    if (routeKey === 'GET /api/v1/subscriptions/current') return getCurrentSubscription(req, res);
    if (routeKey === 'POST /api/v1/redemptions/redeem') return redeemCode(req, res, await readJson(req));

    if (routeKey === 'POST /api/v1/lizhihui/entitlements/grant') return lizhihuiGrantEntitlement(req, res, await readJson(req));
    if (routeKey === 'POST /api/v1/lizhihui/subscriptions/activate') return lizhihuiActivateSubscription(req, res, await readJson(req));
    if (routeKey === 'POST /api/v1/lizhihui/subscriptions/renew') return lizhihuiRenewSubscription(req, res, await readJson(req));
    if (routeKey === 'POST /api/v1/lizhihui/subscriptions/cancel') return lizhihuiCancelSubscription(req, res, await readJson(req));
    if (routeKey === 'POST /api/v1/lizhihui/subscriptions/status') return lizhihuiSyncSubscriptionStatus(req, res, await readJson(req));

    if (routeKey === 'POST /api/v1/admin/redemption-batches') return adminCreateRedemptionBatch(req, res, await readJson(req));

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    return sendJson(res, error.statusCode || 500, {
      error: error.message || 'Internal server error',
      ...(error.code ? { code: error.code } : {}),
    });
  }
}

async function checkPhoneRegistered(res, body) {
  const phone = normalizePhone(body.phone);
  if (!phone) throw httpError(400, '请输入手机号');
  const existing = await getOne('SELECT id FROM users WHERE phone = ? LIMIT 1', [phone]);
  return sendJson(res, 200, { registered: Boolean(existing) });
}

async function sendVerificationCode(req, res, body) {
  const phone = normalizePhone(body.phone);
  const purpose = normalizeVerificationPurpose(body.purpose || 'login');
  if (!phone) throw httpError(400, '请输入手机号');

  if (purpose === 'register') {
    const existing = await getOne('SELECT id FROM users WHERE phone = ? LIMIT 1', [phone]);
    if (existing) throw httpError(409, '该手机号已注册，请直接登录', 'PHONE_ALREADY_REGISTERED');
  }

  await enforceVerificationRateLimit(phone, purpose);

  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = hmac(JWT_SECRET, code);
  const verificationId = id('vcode');

  await execute(
    `INSERT INTO user_verification_codes
     (id, phone, purpose, code_hash, provider, status, expires_at, max_attempts, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), ?, ?, ?)`,
    [
      verificationId,
      phone,
      purpose,
      codeHash,
      SMS_PROVIDER,
      'sent',
      5,
      req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
      req.headers['user-agent'] || null,
    ]
  );

  const smsResult = await sendSmsCode(phone, code, purpose);
  await execute(
    'UPDATE user_verification_codes SET send_result_json = ? WHERE id = ?',
    [JSON.stringify(smsResult), verificationId]
  );

  return sendJson(res, 200, {
    success: true,
    verificationId,
    expiresIn: 600,
    provider: SMS_PROVIDER,
    ...(smsResult.mockCode ? { mockCode: smsResult.mockCode } : {}),
  });
}

async function verifyCodeOnly(res, body) {
  const phone = normalizePhone(body.phone);
  const purpose = normalizeVerificationPurpose(body.purpose || 'login');
  const code = clean(body.code);
  await verifySmsCode(phone, code, purpose);
  return sendJson(res, 200, { success: true });
}

async function registerUser(res, body) {
  const name = clean(body.name);
  const email = clean(body.email).toLowerCase() || null;
  const phone = normalizePhone(body.phone);
  const password = String(body.password || '');
  const verificationCode = clean(body.verificationCode || body.code || body.smsCode);
  if (!name || !phone || !verificationCode) {
    throw httpError(400, '请填写姓名、手机号和短信验证码');
  }
  if (password && password.length < 6) {
    throw httpError(400, '密码至少需要 6 位');
  }

  const existing = await getOne('SELECT id FROM users WHERE phone = ? OR (email IS NOT NULL AND email = ?) LIMIT 1', [phone, email]);
  if (existing) throw httpError(409, '该手机号或邮箱已注册，请直接登录');
  await verifySmsCode(phone, verificationCode, 'register');

  const user = {
    id: id('user'),
    name,
    email,
    phone,
    passwordHash: password ? hashPassword(password) : null,
    status: 'active',
  };

  await transaction(async conn => {
    await conn.execute(
      'INSERT INTO users (id, name, email, phone, password_hash, status) VALUES (?, ?, ?, ?, ?, ?)',
      [user.id, user.name, user.email, user.phone, user.passwordHash, user.status]
    );
    await claimPendingByPhone(conn, user.id, phone);
    await audit(conn, user.id, 'user.register', { email, phone });
  });

  return sendJson(res, 201, { user: await publicUserById(user.id), token: signToken(user.id) });
}

async function loginUser(res, body) {
  const phone = normalizePhone(body.phone);
  const verificationCode = clean(body.verificationCode || body.code || body.smsCode);
  if (phone && verificationCode) return loginWithSmsCode(res, phone, verificationCode);

  const login = clean(body.email || body.phone).toLowerCase();
  const password = String(body.password || '');
  const user = await getOne('SELECT * FROM users WHERE email = ? OR phone = ? LIMIT 1', [login, login]);
  if (!user || !verifyPassword(password, user.password_hash)) throw httpError(401, '账号或密码错误，请重试');

  await transaction(async conn => {
    if (user.phone) await claimPendingByPhone(conn, user.id, user.phone);
    await audit(conn, user.id, 'user.login', { login });
  });

  return sendJson(res, 200, { user: await publicUserById(user.id), token: signToken(user.id) });
}

async function loginWithSmsCode(res, phone, verificationCode) {
  await verifySmsCode(phone, verificationCode, 'login');
  const user = await getOne('SELECT * FROM users WHERE phone = ? LIMIT 1', [phone]);
  if (!user) throw httpError(404, '该手机号尚未注册，请先创建账户');

  await transaction(async conn => {
    await claimPendingByPhone(conn, user.id, phone);
    await audit(conn, user.id, 'user.login.sms', { phone });
  });

  return sendJson(res, 200, { user: await publicUserById(user.id), token: signToken(user.id) });
}

async function getMe(req, res) {
  const user = await requireUser(req);
  return sendJson(res, 200, { user: publicUser(user) });
}

async function getAccountSummary(req, res) {
  const user = await requireUser(req);
  const [reports, entitlements, subscription] = await Promise.all([
    query('SELECT id, report_type, title, status, created_at FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [user.id]),
    query('SELECT * FROM entitlements WHERE user_id = ? AND status IN ("active", "pending_bind") ORDER BY created_at DESC', [user.id]),
    getActiveSubscription(user.id),
  ]);
  return sendJson(res, 200, { reports, entitlements, subscription });
}

async function listReportTypes(res) {
  const types = await query('SELECT * FROM report_types WHERE is_active = 1 ORDER BY sort_order ASC');
  return sendJson(res, 200, { reportTypes: types });
}

async function qwenJsonProxy(req, res, body) {
  await requireUser(req);
  if (!body.systemPrompt || !body.userPrompt) throw httpError(400, 'systemPrompt and userPrompt are required');
  const data = await callModelJson(body.systemPrompt, body.userPrompt);
  return sendJson(res, 200, { data });
}

async function submitQuestionnaire(req, res, body) {
  const user = await requireUser(req);
  const reportType = clean(body.reportType);
  const version = clean(body.version || 'v1');
  if (!reportType || !body.answers) throw httpError(400, 'reportType and answers are required');
  await ensureReportType(reportType);
  const submission = {
    id: id('qsub'),
    userId: user.id,
    reportType,
    version,
    answers: body.answers,
  };
  await execute(
    'INSERT INTO questionnaire_submissions (id, user_id, report_type, version, answers_json, status) VALUES (?, ?, ?, ?, ?, ?)',
    [submission.id, user.id, reportType, version, JSON.stringify(body.answers), 'submitted']
  );
  return sendJson(res, 201, { submissionId: submission.id });
}

async function createReportJob(req, res, body) {
  const user = await requireUser(req);
  const reportType = clean(body.reportType);
  const answers = body.questionnaireData || body.answers;
  if (!reportType || !answers) throw httpError(400, '报告类型和问卷内容不能为空');
  await ensureReportType(reportType);

  const entitlementDecision = await canGenerateReport(user.id);
  if (!entitlementDecision.allowed) throw httpError(402, '当前账户没有可用报告权益或有效会员，请先兑换权益或开通会员');

  const jobId = id('job');
  const submissionId = id('qsub');
  const reportId = id('report');

  await execute(
    'INSERT INTO questionnaire_submissions (id, user_id, report_type, version, answers_json, status) VALUES (?, ?, ?, ?, ?, ?)',
    [submissionId, user.id, reportType, body.questionnaireVersion || 'v1', JSON.stringify(answers), 'submitted']
  );

  await execute(
    'INSERT INTO report_jobs (id, user_id, report_type, questionnaire_submission_id, status, progress, model_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [jobId, user.id, reportType, submissionId, 'processing', 10, DASHSCOPE_MODEL]
  );

  try {
    const generated = await generateStructuredReport(reportType, answers);
    const title = getReportTitle(reportType);

    await transaction(async conn => {
      await conn.execute(
        'INSERT INTO reports (id, user_id, report_type, questionnaire_submission_id, report_job_id, title, summary, full_content_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [reportId, user.id, reportType, submissionId, jobId, title, generated.summary || generated.reportSummary || '', JSON.stringify(generated), 'completed']
      );
      await conn.execute(
        'INSERT INTO report_chart_data (id, report_id, chart_key, chart_type, data_json) VALUES (?, ?, ?, ?, ?)',
        [id('chart'), reportId, 'main', 'json', JSON.stringify(generated.chartData || generated.scoringDimensions || {})]
      );
      await conn.execute(
        'UPDATE report_jobs SET status = ?, progress = ?, report_id = ?, completed_at = NOW() WHERE id = ?',
        ['completed', 100, reportId, jobId]
      );
      if (entitlementDecision.source === 'entitlement') {
        await consumeEntitlement(conn, entitlementDecision.entitlement.id, user.id, reportId);
      } else {
        await logUsage(conn, user.id, null, entitlementDecision.subscription.id, reportId, 'subscription_unlimited');
      }
      await audit(conn, user.id, 'report.completed', { reportId, reportType, source: entitlementDecision.source });
    });

    const report = await getReportForUser(reportId, user.id);
    return sendJson(res, 201, { jobId, report });
  } catch (error) {
    await execute('UPDATE report_jobs SET status = ?, error_message = ?, completed_at = NOW() WHERE id = ?', ['failed', error.message, jobId]);
    throw error;
  }
}

async function listUserReports(req, res) {
  const user = await requireUser(req);
  const reports = await query(
    'SELECT id, report_type AS reportType, title, summary, status, created_at AS createdAt FROM reports WHERE user_id = ? ORDER BY created_at DESC',
    [user.id]
  );
  return sendJson(res, 200, { reports });
}

async function getUserReport(req, res, reportId) {
  const user = await requireUser(req);
  const report = await getReportForUser(reportId, user.id);
  if (!report) throw httpError(404, 'Report not found');
  return sendJson(res, 200, { report });
}

async function getReportJob(req, res, jobId) {
  const user = await requireUser(req);
  const job = await getOne('SELECT * FROM report_jobs WHERE id = ? AND user_id = ?', [jobId, user.id]);
  if (!job) throw httpError(404, 'Job not found');
  return sendJson(res, 200, { job });
}

async function listUserEntitlements(req, res) {
  const user = await requireUser(req);
  const entitlements = await query('SELECT * FROM entitlements WHERE user_id = ? ORDER BY created_at DESC', [user.id]);
  return sendJson(res, 200, { entitlements });
}

async function redeemEntitlementForReport(req, res, body) {
  const user = await requireUser(req);
  const entitlementId = clean(body.entitlementId);
  const reportId = clean(body.reportId);
  if (!entitlementId || !reportId) throw httpError(400, 'entitlementId and reportId are required');
  await transaction(async conn => {
    await consumeEntitlement(conn, entitlementId, user.id, reportId);
  });
  return sendJson(res, 200, { success: true });
}

async function getCurrentSubscription(req, res) {
  const user = await requireUser(req);
  return sendJson(res, 200, { subscription: await getActiveSubscription(user.id) });
}

async function redeemCode(req, res, body) {
  const user = await requireUser(req);
  const codeValue = clean(body.code).toUpperCase();
  if (!codeValue) throw httpError(400, 'code is required');

  let result;
  await transaction(async conn => {
    const code = await getOneForUpdate(conn, 'SELECT * FROM redemption_codes WHERE code = ? FOR UPDATE', [codeValue]);
    if (!code) throw httpError(404, '兑换码不存在，请检查后重试');
    if (code.status !== 'active') throw httpError(409, '兑换码当前不可用');
    if (code.expires_at && new Date(code.expires_at) < new Date()) throw httpError(410, '兑换码已过期');
    if (Number(code.used_count) >= Number(code.max_uses)) throw httpError(409, '兑换码已被使用');

    const existing = await getOneForUpdate(conn, 'SELECT id FROM user_redemption_records WHERE user_id = ? AND redemption_code_id = ? LIMIT 1', [user.id, code.id]);
    if (existing) throw httpError(409, '您已经兑换过该兑换码');

    if (code.reward_type === 'entitlement') {
      const entitlement = await createEntitlement(conn, {
        userId: user.id,
        phone: user.phone,
        type: 'report_once',
        quantity: 1,
        source: 'redemption_code',
        externalOrderId: code.code,
        status: 'active',
        expiresAt: addMonthsIso(6),
      });
      result = { type: 'entitlement', entitlement };
    } else if (code.reward_type === 'subscription_month') {
      const subscription = await createOrExtendSubscription(conn, {
        userId: user.id,
        phone: user.phone,
        source: 'redemption_code',
        externalOrderId: code.code,
        startTime: now(),
        endTime: addMonthsIso(1),
        status: 'active',
      });
      result = { type: 'subscription', subscription };
    } else {
      throw httpError(400, 'Unsupported redemption reward type');
    }

    await conn.execute('UPDATE redemption_codes SET used_count = used_count + 1 WHERE id = ?', [code.id]);
    await conn.execute(
      'INSERT INTO user_redemption_records (id, user_id, redemption_code_id, result_type, result_ref_id) VALUES (?, ?, ?, ?, ?)',
      [id('redeem'), user.id, code.id, result.type, result.entitlement?.id || result.subscription?.id]
    );
    await audit(conn, user.id, 'redemption.redeemed', { code: code.code, resultType: result.type });
  });

  return sendJson(res, 200, { success: true, result });
}

async function lizhihuiGrantEntitlement(req, res, body) {
  verifyPartnerSignature(req, body);
  const payload = normalizeLizhihuiPayload(body);
  assertPaidStatus(payload);
  if (!payload.phone || !payload.externalOrderId) throw httpError(400, 'phone and external_order_id are required');
  const existing = await getOne('SELECT id FROM entitlements WHERE external_order_id = ? AND source = ?', [payload.externalOrderId, 'lizhihui']);
  if (existing) return sendJson(res, 200, { success: true, idempotent: true, entitlementId: existing.id });

  let entitlement;
  await transaction(async conn => {
    await recordExternalEvent(conn, 'lizhihui', 'entitlement_grant', payload.requestId, payload.externalOrderId, body);
    const user = await getUserByPhoneConn(conn, payload.phone);
    entitlement = await createEntitlement(conn, {
      userId: user?.id || null,
      phone: payload.phone,
      type: payload.entitlementType || 'report_once',
      quantity: Number(payload.quantity || 1),
      source: 'lizhihui',
      externalOrderId: payload.externalOrderId,
      externalRequestId: payload.requestId,
      status: user ? 'active' : 'pending_bind',
      expiresAt: payload.expiresAt || addMonthsIso(6),
    });
    await audit(conn, user?.id || null, 'lizhihui.entitlement_grant', { entitlementId: entitlement.id, status: entitlement.status });
  });
  return sendJson(res, 201, { success: true, entitlement });
}

async function lizhihuiActivateSubscription(req, res, body) {
  verifyPartnerSignature(req, body);
  const payload = normalizeLizhihuiPayload(body);
  assertPaidStatus(payload);
  if (!payload.phone || !payload.externalOrderId) throw httpError(400, 'phone and external_order_id are required');
  const existing = await getOne('SELECT id FROM subscriptions WHERE external_order_id = ? AND source = ?', [payload.externalOrderId, 'lizhihui']);
  if (existing) return sendJson(res, 200, { success: true, idempotent: true, subscriptionId: existing.id });

  let subscription;
  await transaction(async conn => {
    await recordExternalEvent(conn, 'lizhihui', 'subscription_activate', payload.requestId, payload.externalOrderId, body);
    const user = await getUserByPhoneConn(conn, payload.phone);
    subscription = await createOrExtendSubscription(conn, {
      userId: user?.id || null,
      phone: payload.phone,
      source: 'lizhihui',
      externalOrderId: payload.externalOrderId,
      externalRequestId: payload.requestId,
      startTime: payload.startTime || now(),
      endTime: payload.endTime || addMonthsIso(1),
      status: user ? 'active' : 'pending_bind',
      renewalStatus: 'active',
    });
    await audit(conn, user?.id || null, 'lizhihui.subscription_activate', { subscriptionId: subscription.id, status: subscription.status });
  });
  return sendJson(res, 201, { success: true, subscription });
}

async function lizhihuiRenewSubscription(req, res, body) {
  verifyPartnerSignature(req, body);
  const payload = normalizeLizhihuiPayload(body);
  assertPaidStatus(payload);
  if (!payload.phone || !payload.externalOrderId) throw httpError(400, 'phone and external_order_id are required');
  const existing = await getOne('SELECT id FROM subscriptions WHERE external_order_id = ? AND source = ?', [payload.externalOrderId, 'lizhihui']);
  if (existing) return sendJson(res, 200, { success: true, idempotent: true, subscriptionId: existing.id });

  let subscription;
  await transaction(async conn => {
    await recordExternalEvent(conn, 'lizhihui', 'subscription_renew', payload.requestId, payload.externalOrderId, body);
    const user = await getUserByPhoneConn(conn, payload.phone);
    subscription = await createOrExtendSubscription(conn, {
      userId: user?.id || null,
      phone: payload.phone,
      source: 'lizhihui',
      externalOrderId: payload.externalOrderId,
      externalRequestId: payload.requestId,
      startTime: payload.startTime || now(),
      endTime: payload.endTime || addMonthsIso(1),
      status: user ? 'active' : 'pending_bind',
      renewalStatus: 'active',
    });
  });
  return sendJson(res, 200, { success: true, subscription });
}

async function lizhihuiCancelSubscription(req, res, body) {
  verifyPartnerSignature(req, body);
  const payload = normalizeLizhihuiPayload(body);
  await execute(
    'UPDATE subscriptions SET renewal_status = ?, status = IF(end_time > NOW(), status, "expired"), updated_at = NOW() WHERE external_order_id = ? AND source = ?',
    ['cancelled', payload.externalOrderId, 'lizhihui']
  );
  return sendJson(res, 200, { success: true });
}

async function lizhihuiSyncSubscriptionStatus(req, res, body) {
  verifyPartnerSignature(req, body);
  const payload = normalizeLizhihuiPayload(body);
  if (!payload.externalOrderId || !payload.status) throw httpError(400, 'external_order_id and status are required');
  await execute(
    'UPDATE subscriptions SET status = ?, updated_at = NOW() WHERE external_order_id = ? AND source = ?',
    [payload.status, payload.externalOrderId, 'lizhihui']
  );
  return sendJson(res, 200, { success: true });
}

async function adminCreateRedemptionBatch(req, res, body) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || req.headers['x-admin-key'] !== adminKey) throw httpError(401, 'Unauthorized');
  const rewardType = clean(body.rewardType);
  const count = Math.min(Number(body.count || 1), 1000);
  if (!['entitlement', 'subscription_month'].includes(rewardType)) {
    throw httpError(400, 'rewardType must be entitlement or subscription_month');
  }
  const batch = {
    id: id('batch'),
    name: clean(body.name || `${rewardType} batch`),
    codeType: rewardType === 'entitlement' ? 'report_once' : 'monthly_subscription',
    rewardType,
    expiresAt: body.expiresAt || addMonthsIso(12),
  };
  const codes = [];
  await transaction(async conn => {
    await conn.execute(
      'INSERT INTO redemption_batches (id, name, code_type, reward_type, status, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [batch.id, batch.name, batch.codeType, batch.rewardType, 'active', toMysqlDate(batch.expiresAt)]
    );
    for (let i = 0; i < count; i++) {
      const code = `${rewardType === 'entitlement' ? 'RPT' : 'VIP'}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const codeId = id('rcode');
      await conn.execute(
        'INSERT INTO redemption_codes (id, batch_id, code, reward_type, max_uses, status, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [codeId, batch.id, code, rewardType, 1, 'active', toMysqlDate(batch.expiresAt)]
      );
      codes.push({ id: codeId, code });
    }
  });
  return sendJson(res, 201, { batch, codes });
}

async function canGenerateReport(userId) {
  const subscription = await getActiveSubscription(userId);
  if (subscription?.unlimitedMonthlyUsage) return { allowed: true, source: 'subscription', subscription };

  const entitlement = await getOne(
    'SELECT * FROM entitlements WHERE user_id = ? AND status = "active" AND remaining_quantity > 0 AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY expires_at ASC, created_at ASC LIMIT 1',
    [userId]
  );
  if (entitlement) return { allowed: true, source: 'entitlement', entitlement: entitlementFromRow(entitlement) };
  return { allowed: false };
}

async function generateStructuredReport(reportType, answers) {
  const prompt = buildPrompt(reportType, answers);
  const result = await callModelJson(prompt.system, prompt.user);
  return normalizeReportResult(reportType, result, answers);
}

async function callModelJson(systemPrompt, userPrompt) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(process.env.MODEL_TIMEOUT_MS || 90000));
    try {
      const response = await fetch(`${DASHSCOPE_API_BASE}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        },
        body: JSON.stringify({
          model: DASHSCOPE_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.55,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
        }),
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`DashScope ${response.status}: ${(await response.text()).slice(0, 300)}`);
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('DashScope returned empty content');
      return JSON.parse(content);
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      await delay(500 * attempt);
    }
  }
  throw httpError(502, `Model generation failed: ${lastError.message}`);
}

function buildPrompt(reportType, answers) {
  const typeName = getReportTitle(reportType);
  const competitivenessSchema = reportType === 'competitiveness'
    ? [
      '如果 reportType 是 competitiveness，JSON 还必须包含以下字段：',
      'overallScore: 0-100 数字。',
      'scoringDimensions: 对象，必须包含 academics, testScores, majorFit, backgroundDepth, highVisibility, narrativeMaturity 六个 0-100 数字。',
      'schoolRecommendations: 对象，必须包含 reach 和 match 两个数组；reach 至少 3 个学校，match 至少 3 个学校。每个学校包含 name, country, qs, matchScore, note。',
      'keyGaps: 数组，至少 3 项，每项包含 level, title, desc。',
      'targetMajorRisk: 数组，至少 3 项，每项包含 major, risk, note。',
      'recommendations: 数组，至少 3 项，每项包含 title, desc。',
      'conclusion: 字符串。',
      '不得省略上述数组，不知道具体学校时也要基于用户目标国家、专业和背景给出合理候选。',
    ].join('\n')
    : '';
  return {
    system: [
      '你是一个严谨的教育规划报告生成引擎。',
      '你必须只输出 JSON，不输出 Markdown。',
      'JSON 必须包含 summary, sections, chartData, recommendations, risks, nextSteps 字段。',
      'sections 是数组，每项包含 title 和 content。',
      'chartData 必须适合前端图表渲染，包含至少一个 scores 对象。',
      competitivenessSchema,
    ].join('\n'),
    user: JSON.stringify({
      reportType,
      reportName: typeName,
      answers,
      outputLanguage: 'zh-CN',
      requirement: '生成一份可直接展示给用户的结构化教育规划报告。',
    }),
  };
}

function normalizeReportResult(reportType, result, answers = {}) {
  const base = {
    ...result,
    reportType,
    summary: result.summary || result.reportSummary || '报告已生成。',
    sections: Array.isArray(result.sections) ? result.sections : [],
    chartData: result.chartData || result.scoringDimensions || {},
    recommendations: result.recommendations || result.nextSteps || [],
    risks: result.risks || [],
    nextSteps: result.nextSteps || [],
    raw: result,
  };
  if (reportType === 'competitiveness') return normalizeCompetitivenessResult(base, answers);
  return base;
}

function normalizeCompetitivenessResult(result, answers = {}) {
  const sections = Array.isArray(result.sections) ? result.sections : [];
  const chartData = result.chartData && typeof result.chartData === 'object' ? result.chartData : {};
  const scoringDimensions = normalizeScoreObject(
    result.scoringDimensions ||
    chartData.scoringDimensions ||
    chartData.scores ||
    result.scores
  );
  const scoreValues = Object.values(scoringDimensions).filter(Number.isFinite);
  const inferredScore = scoreValues.length
    ? Math.round(scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length)
    : 70;
  const schoolRecommendations = normalizeSchoolRecommendations(result, answers);
  const recommendations = normalizeRecommendationList(result.recommendations || result.nextSteps);
  const keyGaps = normalizeGapList(result.keyGaps || result.risks);
  const filledGaps = keyGaps.length ? keyGaps : fallbackGaps(result, answers);
  const filledRecommendations = recommendations.length ? recommendations : fallbackRecommendations(result, answers);
  const filledMajorRisk = normalizeMajorRisk(result.targetMajorRisk || result.majorRisks || []);

  return {
    ...result,
    overallScore: toScore(result.overallScore || chartData.overallScore || chartData.score, inferredScore),
    scoringDimensions,
    chartData: {
      ...chartData,
      overallScore: toScore(result.overallScore || chartData.overallScore || chartData.score, inferredScore),
      scoringDimensions,
      scores: scoringDimensions,
    },
    reportSummary: result.reportSummary || result.summary || sections[0]?.content || '报告已生成。',
    summary: result.summary || result.reportSummary || sections[0]?.content || '报告已生成。',
    schoolRecommendations,
    reachSchools: schoolRecommendations.reach,
    matchSchools: schoolRecommendations.match,
    keyGaps: filledGaps,
    gapAnalysis: {
      ...(result.gapAnalysis || {}),
      keyGaps: filledGaps,
    },
    targetMajorRisk: filledMajorRisk.length ? filledMajorRisk : fallbackMajorRisk(answers),
    recommendations: filledRecommendations,
    reinforcementPlan: {
      ...(result.reinforcementPlan || {}),
      topActions: normalizeRecommendationList(result.reinforcementPlan?.topActions || filledRecommendations),
    },
    conclusion: result.conclusion || result.nextSteps?.map(item => item.step || item.title || item).filter(Boolean).join('；') || '',
  };
}

function normalizeScoreObject(value) {
  const source = value && typeof value === 'object' ? value : {};
  const defaults = {
    academics: 70,
    testScores: 70,
    majorFit: 70,
    backgroundDepth: 68,
    highVisibility: 65,
    narrativeMaturity: 68,
  };
  const aliases = {
    academics: ['academics', 'academic', 'academicStrength', '学术基础'],
    testScores: ['testScores', 'languageScores', 'standardizedTests', '语言标化', '标化成绩'],
    majorFit: ['majorFit', 'fit', 'programFit', '专业匹配度'],
    backgroundDepth: ['backgroundDepth', 'activities', 'extracurriculars', '背景深度'],
    highVisibility: ['highVisibility', 'researchInnovation', 'leadership', '辨识度'],
    narrativeMaturity: ['narrativeMaturity', 'applicationStrategy', 'story', '申请叙事'],
  };
  const normalized = {};
  for (const [key, names] of Object.entries(aliases)) {
    const found = names.map(name => source[name]).find(item => item !== undefined && item !== null);
    normalized[key] = toScore(found, defaults[key]);
  }
  return normalized;
}

function normalizeSchoolRecommendations(result, answers = {}) {
  const sr = result.schoolRecommendations || {};
  const reach = normalizeSchoolList(sr.reach || result.reachSchools || result.reach || []);
  const match = normalizeSchoolList(sr.match || result.matchSchools || result.match || []);
  const fallback = fallbackSchools(answers);
  return {
    schoolAnalysisText: sr.schoolAnalysisText || result.schoolAnalysisText || '',
    reach: reach.length ? reach : fallback.reach,
    match: match.length ? match : fallback.match,
  };
}

function normalizeSchoolList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item, index) => ({
    name: clean(item.name || item.school || item.university || `推荐院校 ${index + 1}`),
    country: clean(item.country || item.region || ''),
    qs: clean(item.qs || item.ranking || item.rank || ''),
    matchScore: toScore(item.matchScore || item.score || item.fitScore, 70),
    note: clean(item.note || item.reason || item.whyReach || item.whyMatch || item.desc || ''),
  }));
}

function normalizeGapList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(item => ({
    level: clean(item.level || item.urgency || 'important'),
    title: clean(item.title || item.risk || item.name || '待补强项目'),
    desc: clean(item.desc || item.description || item.content || item.note || ''),
  }));
}

function normalizeMajorRisk(list) {
  if (!Array.isArray(list)) return [];
  return list.map(item => ({
    major: clean(item.major || item.name || '目标方向'),
    risk: toScore(item.risk || item.riskScore || item.score, 50),
    note: clean(item.note || item.riskNote || item.reason || ''),
  }));
}

function normalizeRecommendationList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(item => {
    if (typeof item === 'string') return { title: item, desc: '' };
    return {
      ...item,
      title: clean(item.title || item.action || item.step || item.name || item.recommendation || '建议事项'),
      desc: clean(item.desc || item.description || item.expectedImpact || item.content || item.detail || ''),
      timeline: item.timeline || item.timeframe || '',
    };
  });
}

function fallbackSchools(answers = {}) {
  const target = JSON.stringify(answers).toLowerCase();
  if (target.includes('uk') || target.includes('英国')) {
    return {
      reach: [
        { name: 'University College London', country: '英国', qs: 'QS Top 10', matchScore: 62, note: '适合作为冲刺目标，需强化学术成绩、专业叙事和相关经历。' },
        { name: 'King’s College London', country: '英国', qs: 'QS Top 40', matchScore: 66, note: '综合匹配度较高，但仍需要更清晰的专业动机与文书策略。' },
        { name: 'University of Edinburgh', country: '英国', qs: 'QS Top 30', matchScore: 64, note: '适合作为高目标院校，需要补足核心短板。' },
      ],
      match: [
        { name: 'University of Manchester', country: '英国', qs: 'QS Top 40', matchScore: 76, note: '整体匹配度较稳，适合作为主申梯队。' },
        { name: 'University of Bristol', country: '英国', qs: 'QS Top 60', matchScore: 78, note: '与当前背景较匹配，建议结合专业方向细化。' },
        { name: 'University of Glasgow', country: '英国', qs: 'QS Top 80', matchScore: 82, note: '可作为稳妥匹配选择，兼顾排名与录取概率。' },
      ],
    };
  }
  return {
    reach: [
      { name: 'University of Toronto', country: '加拿大', qs: 'QS Top 25', matchScore: 64, note: '适合作为冲刺目标，需要强化核心成绩与申请叙事。' },
      { name: 'University of British Columbia', country: '加拿大', qs: 'QS Top 40', matchScore: 66, note: '目标匹配度中等偏上，建议补充专业相关经历。' },
      { name: 'The University of Hong Kong', country: '中国香港', qs: 'QS Top 20', matchScore: 62, note: '竞争较强，适合作为亚太方向冲刺选择。' },
    ],
    match: [
      { name: 'McMaster University', country: '加拿大', qs: 'QS Top 150', matchScore: 78, note: '整体匹配度较稳，可作为主申梯队。' },
      { name: 'University of Alberta', country: '加拿大', qs: 'QS Top 120', matchScore: 80, note: '录取可行性较高，适合搭配申请。' },
      { name: 'University of Sydney', country: '澳大利亚', qs: 'QS Top 20', matchScore: 76, note: '申请路径相对清晰，可作为多国组合中的匹配选项。' },
    ],
  };
}

function fallbackGaps(result, answers = {}) {
  const summary = clean(result.summary || result.reportSummary || '');
  return [
    { level: 'important', title: '目标院校与专业定位仍需细化', desc: summary || '当前问卷信息尚不足以形成非常精确的院校梯队，建议补充目标国家、专业方向和成绩区间。' },
    { level: 'important', title: '申请叙事需要更聚焦', desc: '需要把学术兴趣、活动经历和未来目标串成一条更清晰的申请主线。' },
    { level: 'note', title: '高辨识度成果仍可加强', desc: '如科研、竞赛、实习、项目作品或社会影响力成果，将显著提升报告评估中的竞争力。' },
  ];
}

function fallbackRecommendations(result, answers = {}) {
  return [
    { title: '补充目标国家与专业信息', desc: '优先明确 1-2 个目标国家和 2-3 个专业方向，便于生成更准确的院校梯队。' },
    { title: '整理核心成绩与背景素材', desc: '补充 GPA、语言/标化成绩、竞赛、科研、实习和活动成果。' },
    { title: '建立申请时间线', desc: '按考试、背景提升、选校、文书和提交节点拆分未来 3-12 个月计划。' },
  ];
}

function fallbackMajorRisk(answers = {}) {
  return [
    { major: '公共卫生 / 心理学相关方向', risk: 58, note: '需根据先修课程、研究经历和目标院校要求进一步判断。' },
    { major: '教育学 / 社会科学方向', risk: 48, note: '整体路径较清晰，但需要强化文书叙事和相关实践经历。' },
    { major: '商科 / 管理方向', risk: 65, note: '竞争较强，需要更明确的量化能力或实习成果支撑。' },
  ];
}

function toScore(value, fallback = 70) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

async function consumeEntitlement(conn, entitlementId, userId, reportId) {
  const entitlement = await getOneForUpdate(conn, 'SELECT * FROM entitlements WHERE id = ? AND user_id = ? FOR UPDATE', [entitlementId, userId]);
  if (!entitlement) throw httpError(404, 'Entitlement not found');
  if (entitlement.status !== 'active' || Number(entitlement.remaining_quantity) <= 0) throw httpError(409, 'Entitlement unavailable');
  if (entitlement.expires_at && new Date(entitlement.expires_at) < new Date()) throw httpError(410, 'Entitlement expired');
  const remaining = Number(entitlement.remaining_quantity) - 1;
  await conn.execute(
    'UPDATE entitlements SET remaining_quantity = ?, status = IF(? = 0, "used", "active"), updated_at = NOW() WHERE id = ?',
    [remaining, remaining, entitlementId]
  );
  await logUsage(conn, userId, entitlementId, null, reportId, 'entitlement_report_generation');
}

async function createEntitlement(conn, data) {
  const entitlement = {
    id: id('ent'),
    userId: data.userId || null,
    phone: normalizePhone(data.phone),
    type: data.type || 'report_once',
    source: data.source,
    status: data.status || (data.userId ? 'active' : 'pending_bind'),
    totalQuantity: Number(data.quantity || 1),
    remainingQuantity: Number(data.quantity || 1),
    externalOrderId: data.externalOrderId || null,
    externalRequestId: data.externalRequestId || null,
    expiresAt: data.expiresAt || null,
  };
  await conn.execute(
    `INSERT INTO entitlements
     (id, user_id, phone, entitlement_type, source, status, total_quantity, remaining_quantity, external_order_id, external_request_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [entitlement.id, entitlement.userId, entitlement.phone, entitlement.type, entitlement.source, entitlement.status, entitlement.totalQuantity, entitlement.remainingQuantity, entitlement.externalOrderId, entitlement.externalRequestId, toMysqlDate(entitlement.expiresAt)]
  );
  return entitlement;
}

async function createOrExtendSubscription(conn, data) {
  const plan = await getOneForUpdate(conn, 'SELECT * FROM subscription_plans WHERE code = ? LIMIT 1', ['monthly_unlimited']);
  const userId = data.userId || null;
  const phone = normalizePhone(data.phone);
  const existing = userId
    ? await getOneForUpdate(conn, 'SELECT * FROM subscriptions WHERE user_id = ? AND status IN ("active", "pending_bind") ORDER BY end_time DESC LIMIT 1', [userId])
    : null;
  const startTime = toMysqlDate(data.startTime || now());
  const endTime = toMysqlDate(data.endTime || addMonthsIso(1));

  if (existing && userId) {
    const extendedEnd = new Date(existing.end_time) > new Date(endTime) ? addMonthsIsoFrom(existing.end_time, 1) : endTime;
    await conn.execute(
      'UPDATE subscriptions SET end_time = ?, renewal_status = ?, updated_at = NOW() WHERE id = ?',
      [toMysqlDate(extendedEnd), data.renewalStatus || 'active', existing.id]
    );
    return { id: existing.id, userId, phone, status: existing.status, endTime: extendedEnd, unlimitedMonthlyUsage: true };
  }

  const subscription = {
    id: id('sub'),
    planId: plan.id,
    userId,
    phone,
    source: data.source,
    status: data.status || (userId ? 'active' : 'pending_bind'),
    renewalStatus: data.renewalStatus || 'active',
    externalOrderId: data.externalOrderId || null,
    externalRequestId: data.externalRequestId || null,
    startTime,
    endTime,
  };
  await conn.execute(
    `INSERT INTO subscriptions
     (id, plan_id, user_id, phone, source, status, renewal_status, external_order_id, external_request_id, start_time, end_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [subscription.id, subscription.planId, subscription.userId, subscription.phone, subscription.source, subscription.status, subscription.renewalStatus, subscription.externalOrderId, subscription.externalRequestId, subscription.startTime, subscription.endTime]
  );
  return { ...subscription, unlimitedMonthlyUsage: true };
}

async function claimPendingByPhone(conn, userId, phone) {
  if (!phone) return;
  await conn.execute(
    'UPDATE entitlements SET user_id = ?, status = "active", bound_at = NOW(), updated_at = NOW() WHERE phone = ? AND user_id IS NULL AND status = "pending_bind"',
    [userId, phone]
  );
  await conn.execute(
    'UPDATE subscriptions SET user_id = ?, status = "active", bound_at = NOW(), updated_at = NOW() WHERE phone = ? AND user_id IS NULL AND status = "pending_bind"',
    [userId, phone]
  );
}

async function getActiveSubscription(userId) {
  const row = await getOne(
    `SELECT us.*, sp.unlimited_monthly_usage
     FROM subscriptions us
     JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = ? AND us.status = "active" AND us.start_time <= NOW() AND us.end_time > NOW()
     ORDER BY us.end_time DESC LIMIT 1`,
    [userId]
  );
  return row ? subscriptionFromRow(row) : null;
}

async function getReportForUser(reportId, userId) {
  const report = await getOne(
    'SELECT id, report_type AS reportType, title, summary, full_content_json AS fullContentJson, status, created_at AS createdAt FROM reports WHERE id = ? AND user_id = ?',
    [reportId, userId]
  );
  if (!report) return null;
  const charts = await query('SELECT chart_key AS chartKey, chart_type AS chartType, data_json AS dataJson FROM report_chart_data WHERE report_id = ?', [reportId]);
  return {
    ...report,
    reportData: parseJson(report.fullContentJson),
    charts: charts.map(c => ({ ...c, data: parseJson(c.dataJson) })),
  };
}

async function initSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) UNIQUE,
      phone VARCHAR(32) NOT NULL UNIQUE,
      password_hash VARCHAR(255),
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_verification_codes (
      id VARCHAR(64) PRIMARY KEY,
      phone VARCHAR(32) NOT NULL,
      purpose VARCHAR(32) NOT NULL,
      code_hash VARCHAR(255) NOT NULL,
      provider VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'sent',
      attempts INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 5,
      expires_at DATETIME NOT NULL,
      verified_at DATETIME,
      send_result_json JSON,
      ip_address VARCHAR(80),
      user_agent VARCHAR(255),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_vcode_phone_purpose (phone, purpose, created_at),
      INDEX idx_vcode_status (status, expires_at)
    )`,
    `CREATE TABLE IF NOT EXISTS auth_sessions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      refresh_token_hash VARCHAR(255),
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      expires_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS report_types (
      code VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      is_active TINYINT NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS questionnaire_versions (
      id VARCHAR(64) PRIMARY KEY,
      report_type VARCHAR(64) NOT NULL,
      version VARCHAR(32) NOT NULL,
      schema_json JSON,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_questionnaire_version (report_type, version)
    )`,
    `CREATE TABLE IF NOT EXISTS questionnaire_submissions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      report_type VARCHAR(64) NOT NULL,
      version VARCHAR(32) NOT NULL,
      answers_json JSON NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'submitted',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      INDEX idx_qs_user (user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS report_jobs (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      report_type VARCHAR(64) NOT NULL,
      questionnaire_submission_id VARCHAR(64) NOT NULL,
      report_id VARCHAR(64),
      status VARCHAR(32) NOT NULL,
      progress INT NOT NULL DEFAULT 0,
      model_name VARCHAR(100),
      error_message TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id),
      INDEX idx_report_jobs_user (user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS reports (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      report_type VARCHAR(64) NOT NULL,
      questionnaire_submission_id VARCHAR(64) NOT NULL,
      report_job_id VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      summary TEXT,
      full_content_json JSON NOT NULL,
      status VARCHAR(32) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      INDEX idx_reports_user (user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS report_sections (
      id VARCHAR(64) PRIMARY KEY,
      report_id VARCHAR(64) NOT NULL,
      section_key VARCHAR(100),
      title VARCHAR(255),
      content MEDIUMTEXT,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id)
    )`,
    `CREATE TABLE IF NOT EXISTS report_chart_data (
      id VARCHAR(64) PRIMARY KEY,
      report_id VARCHAR(64) NOT NULL,
      chart_key VARCHAR(100) NOT NULL,
      chart_type VARCHAR(64) NOT NULL,
      data_json JSON NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id)
    )`,
    `CREATE TABLE IF NOT EXISTS entitlements (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64),
      phone VARCHAR(32),
      entitlement_type VARCHAR(64) NOT NULL,
      source VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL,
      total_quantity INT NOT NULL DEFAULT 1,
      remaining_quantity INT NOT NULL DEFAULT 1,
      external_order_id VARCHAR(128),
      external_request_id VARCHAR(128),
      expires_at DATETIME,
      bound_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_entitlement_order (source, external_order_id),
      INDEX idx_entitlements_user (user_id),
      INDEX idx_entitlements_phone (phone)
    )`,
    `CREATE TABLE IF NOT EXISTS usage_logs (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      entitlement_id VARCHAR(64),
      subscription_id VARCHAR(64),
      report_id VARCHAR(64),
      usage_type VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_usage_user (user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS subscription_plans (
      id VARCHAR(64) PRIMARY KEY,
      code VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      unlimited_monthly_usage TINYINT NOT NULL DEFAULT 1,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS subscriptions (
      id VARCHAR(64) PRIMARY KEY,
      plan_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64),
      phone VARCHAR(32),
      source VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL,
      renewal_status VARCHAR(32) NOT NULL DEFAULT 'active',
      external_order_id VARCHAR(128),
      external_request_id VARCHAR(128),
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      bound_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_subscription_order (source, external_order_id),
      INDEX idx_sub_user (user_id),
      INDEX idx_sub_phone (phone)
    )`,
    `CREATE TABLE IF NOT EXISTS redemption_batches (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      code_type VARCHAR(64) NOT NULL,
      reward_type VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      expires_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS redemption_codes (
      id VARCHAR(64) PRIMARY KEY,
      batch_id VARCHAR(64),
      code VARCHAR(80) NOT NULL UNIQUE,
      reward_type VARCHAR(64) NOT NULL,
      max_uses INT NOT NULL DEFAULT 1,
      used_count INT NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      expires_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_redemption_records (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      redemption_code_id VARCHAR(64) NOT NULL,
      result_type VARCHAR(64) NOT NULL,
      result_ref_id VARCHAR(64),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_code (user_id, redemption_code_id)
    )`,
    `CREATE TABLE IF NOT EXISTS external_channel_bindings (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64),
      channel VARCHAR(64) NOT NULL,
      external_user_id VARCHAR(128),
      phone VARCHAR(32),
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_channel_user (channel, external_user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS external_channel_events (
      id VARCHAR(64) PRIMARY KEY,
      channel VARCHAR(64) NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      request_id VARCHAR(128),
      external_order_id VARCHAR(128),
      payload_json JSON NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'received',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_channel_request (channel, request_id)
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64),
      action VARCHAR(120) NOT NULL,
      metadata_json JSON,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_user (user_id)
    )`,
  ];

  for (const statement of statements) await execute(statement);
  await runLightMigrations();
}

async function runLightMigrations() {
  const migrations = [
    'ALTER TABLE users MODIFY email VARCHAR(255) NULL UNIQUE',
    'ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL',
  ];
  for (const statement of migrations) {
    try {
      await execute(statement);
    } catch (error) {
      if (!['ER_DUP_KEYNAME', 'ER_MULTIPLE_PRI_KEY'].includes(error.code)) {
        console.warn(`Skipped migration: ${statement}`, error.message);
      }
    }
  }
}

async function seedBaseData() {
  const reportTypes = [
    ['competitiveness', '全球留学竞争力评估报告', 1],
    ['family', 'NextGen 家族教育战略智能报告', 2],
    ['career', 'Life-Career Strategy 人生生涯全规划报告', 3],
  ];
  for (const [code, name, sort] of reportTypes) {
    await execute(
      'INSERT IGNORE INTO report_types (code, name, sort_order) VALUES (?, ?, ?)',
      [code, name, sort]
    );
    await execute(
      'INSERT IGNORE INTO questionnaire_versions (id, report_type, version, schema_json, status) VALUES (?, ?, ?, ?, ?)',
      [id('qv'), code, 'v1', JSON.stringify({ source: 'frontend-current' }), 'active']
    );
  }
  await execute(
    'INSERT IGNORE INTO subscription_plans (id, code, name, unlimited_monthly_usage, status) VALUES (?, ?, ?, ?, ?)',
    ['plan_monthly_unlimited', 'monthly_unlimited', '月度无限报告会员', 1, 'active']
  );
}

async function ensureReportType(reportType) {
  const found = await getOne('SELECT code FROM report_types WHERE code = ? AND is_active = 1', [reportType]);
  if (!found) throw httpError(400, 'Invalid report type');
}

function getReportTitle(reportType) {
  return {
    competitiveness: '全球留学竞争力评估报告',
    family: 'NextGen 家族教育战略智能报告',
    career: 'Life-Career Strategy 人生生涯全规划报告',
  }[reportType] || 'AI 教育规划报告';
}

function normalizeLizhihuiPayload(body) {
  return {
    requestId: clean(body.request_id || body.requestId || body.event_id),
    phone: normalizePhone(body.phone || body.user_phone || body.userMobile),
    entitlementType: clean(body.entitlement_type || body.entitlementType),
    quantity: body.quantity || 1,
    externalOrderId: clean(body.external_order_id || body.externalOrderId || body.order_id || body.partnerOrderId),
    channel: clean(body.channel || 'lizhihui'),
    expiresAt: body.expires_at || body.expiresAt || null,
    startTime: body.start_time || body.startTime || null,
    endTime: body.end_time || body.endTime || null,
    status: clean(body.status || body.pay_status || body.paymentStatus),
  };
}

function assertPaidStatus(payload) {
  if (!payload.status) return;
  const paid = ['paid', 'success', 'paid_success', 'completed', 'SUCCESS', 'TRADE_SUCCESS'];
  if (!paid.includes(payload.status)) throw httpError(409, 'Payment status is not paid');
}

async function recordExternalEvent(conn, channel, eventType, requestId, externalOrderId, payload) {
  if (requestId) {
    const existing = await getOneForUpdate(conn, 'SELECT id FROM external_channel_events WHERE channel = ? AND request_id = ? LIMIT 1', [channel, requestId]);
    if (existing) throw httpError(409, 'Duplicate request_id');
  }
  await conn.execute(
    'INSERT INTO external_channel_events (id, channel, event_type, request_id, external_order_id, payload_json, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id('evt'), channel, eventType, requestId || null, externalOrderId || null, JSON.stringify(payload), 'processed']
  );
}

async function logUsage(conn, userId, entitlementId, subscriptionId, reportId, usageType) {
  await conn.execute(
    'INSERT INTO usage_logs (id, user_id, entitlement_id, subscription_id, report_id, usage_type) VALUES (?, ?, ?, ?, ?, ?)',
    [id('usage'), userId, entitlementId, subscriptionId, reportId, usageType]
  );
}

async function audit(conn, userId, action, metadata) {
  await conn.execute(
    'INSERT INTO audit_logs (id, user_id, action, metadata_json) VALUES (?, ?, ?, ?)',
    [id('audit'), userId, action, JSON.stringify(metadata || {})]
  );
}

async function publicUserById(userId) {
  const user = await getOne('SELECT * FROM users WHERE id = ?', [userId]);
  return publicUser(user);
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    createdAt: row.created_at,
  };
}

function entitlementFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    phone: row.phone,
    type: row.entitlement_type,
    source: row.source,
    status: row.status,
    totalQuantity: row.total_quantity,
    remainingQuantity: row.remaining_quantity,
    expiresAt: row.expires_at,
    externalOrderId: row.external_order_id,
  };
}

function subscriptionFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    phone: row.phone,
    status: row.status,
    renewalStatus: row.renewal_status,
    startTime: row.start_time,
    endTime: row.end_time,
    unlimitedMonthlyUsage: !!row.unlimited_monthly_usage,
    source: row.source,
  };
}

async function requireUser(req) {
  const token = getBearerToken(req);
  const payload = verifyToken(token);
  const user = await getOne('SELECT * FROM users WHERE id = ? AND status = "active"', [payload.userId]);
  if (!user) throw httpError(401, 'Unauthorized');
  return user;
}

function signToken(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  return `${payload}.${hmac(JWT_SECRET, payload)}`;
}

function verifyToken(token) {
  if (!token) throw httpError(401, 'Unauthorized');
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !timingSafeEqual(hmac(JWT_SECRET, payload), sig)) throw httpError(401, 'Unauthorized');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (data.exp < Date.now()) throw httpError(401, 'Token expired');
  return data;
}

function getBearerToken(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

function verifyPartnerSignature(req, body) {
  if (!LIZHIHUI_CLIENT_SECRET || LIZHIHUI_CLIENT_SECRET === 'replace-with-shared-secret') return;
  const timestamp = req.headers['x-timestamp'];
  const nonce = req.headers['x-nonce'];
  const signature = req.headers['x-signature'];
  if (!timestamp || !nonce || !signature) throw httpError(401, 'Missing signature headers');
  if (Math.abs(Date.now() - Number(timestamp) * 1000) > 5 * 60 * 1000) throw httpError(401, 'Expired signature');
  const expected = hmac(LIZHIHUI_CLIENT_SECRET, `${timestamp}.${nonce}.${JSON.stringify(body || {})}`);
  if (!timingSafeEqual(signature, expected)) throw httpError(401, 'Invalid signature');
}

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function getOneForUpdate(conn, sql, params = []) {
  const [rows] = await conn.execute(sql, params);
  return rows[0] || null;
}

async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function getUserByPhoneConn(conn, phone) {
  return getOneForUpdate(conn, 'SELECT * FROM users WHERE phone = ? LIMIT 1', [phone]);
}

async function enforceVerificationRateLimit(phone, purpose) {
  const recent = await getOne(
    `SELECT created_at
     FROM user_verification_codes
     WHERE phone = ? AND purpose = ? AND created_at > DATE_SUB(NOW(), INTERVAL 60 SECOND)
     ORDER BY created_at DESC LIMIT 1`,
    [phone, purpose]
  );
  if (recent) throw httpError(429, '验证码发送过于频繁，请稍后再试');

  const hourly = await getOne(
    `SELECT COUNT(*) AS total
     FROM user_verification_codes
     WHERE phone = ? AND purpose = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
    [phone, purpose]
  );
  if (Number(hourly?.total || 0) >= 5) throw httpError(429, '验证码发送次数过多，请稍后再试');
}

async function verifySmsCode(phone, code, purpose) {
  if (!phone || !code) throw httpError(400, '请输入手机号和验证码');
  const expectedHash = hmac(JWT_SECRET, code);

  return transaction(async conn => {
    const record = await getOneForUpdate(
      conn,
      `SELECT *
       FROM user_verification_codes
       WHERE phone = ? AND purpose = ? AND status = "sent"
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [phone, purpose]
    );
    if (!record) throw httpError(400, '请先获取短信验证码');
    const fresh = await getOneForUpdate(conn, 'SELECT expires_at <= NOW() AS expired FROM user_verification_codes WHERE id = ? LIMIT 1', [record.id]);
    if (Number(fresh?.expired || 0) === 1) {
      await conn.execute('UPDATE user_verification_codes SET status = "expired", updated_at = NOW() WHERE id = ?', [record.id]);
      throw httpError(410, '验证码已过期，请重新获取');
    }
    if (Number(record.attempts) >= Number(record.max_attempts)) {
      await conn.execute('UPDATE user_verification_codes SET status = "locked", updated_at = NOW() WHERE id = ?', [record.id]);
      throw httpError(429, '验证码错误次数过多，请重新获取');
    }
    if (!timingSafeEqual(record.code_hash, expectedHash)) {
      await conn.execute('UPDATE user_verification_codes SET attempts = attempts + 1, updated_at = NOW() WHERE id = ?', [record.id]);
      throw httpError(401, '验证码错误，请重试');
    }
    await conn.execute('UPDATE user_verification_codes SET status = "verified", verified_at = NOW(), updated_at = NOW() WHERE id = ?', [record.id]);
    await audit(conn, null, 'sms.verify', { phone, purpose, verificationId: record.id });
    return record;
  });
}

async function sendSmsCode(phone, code, purpose) {
  if (SMS_PROVIDER === 'mock' || SMS_PROVIDER === 'development') {
    console.log(`[SMS mock] purpose=${purpose} phone=${phone} code=${code}`);
    return { provider: SMS_PROVIDER, status: 'mock_sent', mockCode: code };
  }

  if (SMS_PROVIDER === 'aliyun') {
    return sendAliyunSmsCode(phone, code);
  }

  throw httpError(500, `Unsupported SMS_PROVIDER: ${SMS_PROVIDER}`);
}

async function sendAliyunSmsCode() {
  throw httpError(501, '短信服务商尚未接入：请提供阿里云短信 AccessKey、签名名称、模板 Code 和模板变量格式');
}

function normalizeVerificationPurpose(value) {
  const purpose = clean(value);
  if (['register', 'login'].includes(purpose)) return purpose;
  throw httpError(400, '验证码用途只支持 register 或 login');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [salt, hash] = String(passwordHash || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return timingSafeEqual(test, hash);
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hmac(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function id(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function clean(value) {
  return String(value || '').trim();
}

function normalizePhone(value) {
  return String(value || '').replace(/[^\d+]/g, '').trim();
}

function now() {
  return new Date().toISOString();
}

function toMysqlDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function addMonthsIso(months) {
  return addMonthsIsoFrom(new Date(), months);
}

function addMonthsIsoFrom(value, months) {
  const d = new Date(value);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  return JSON.parse(value);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(status === 204 ? '' : JSON.stringify(payload));
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', APP_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Id, X-Timestamp, X-Nonce, X-Signature');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1024 * 1024) reject(httpError(413, 'Payload too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (_) { reject(httpError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function requireEnv(key) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
  return process.env[key];
}

function buildDatabaseConfig() {
  if (process.env.DATABASE_URL) return { uri: process.env.DATABASE_URL };
  return {
    host: requireEnv('DB_HOST'),
    port: Number(process.env.DB_PORT || 3306),
    database: requireEnv('DB_NAME'),
    user: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
  };
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

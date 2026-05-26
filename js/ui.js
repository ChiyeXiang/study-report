/**
 * Global Pathway Navigator
 * UI Controller & Router
 */

const UI = (() => {

  // ---- Toast ----
  function toast(msg, type = 'info', duration = 3500) {
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'toast-out 0.3s ease forwards';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  // ---- Page Router ----
  let currentPage = 'home';

  function showPage(pageId, params = {}) {
    document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
    const page = document.getElementById('page-' + pageId);
    if (page) {
      page.classList.add('active');
      currentPage = pageId;
      window.scrollTo(0, 0);
    }
    // Trigger page-specific init
    if (pageId === 'questionnaire') renderQuestionnaire(params.reportType);
    if (pageId === 'account') renderAccount(params.section || 'overview');
    if (pageId === 'report') renderReportPage(params.reportId);
    if (pageId === 'generating') startGeneration(params);
    updateNav();
  }

  function updateNav() {
    const user = APP.state.user;
    const navUser = document.getElementById('navUser');
    const navLogin = document.getElementById('navLogin');
    if (user) {
      navUser.classList.remove('hidden');
      navLogin.classList.add('hidden');
      document.getElementById('navUserName').textContent = user.name.substring(0, 1);
    } else {
      navUser.classList.add('hidden');
      navLogin.classList.remove('hidden');
    }
  }

  // ---- Auth Modals ----
  function showModal(id) {
    document.getElementById(id).classList.add('active');
  }
  function hideModal(id) {
    document.getElementById(id).classList.remove('active');
  }

  async function handleRegister(e) {
    e.preventDefault();
    setFormNotice('registerFormNotice', '');
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const phone = document.getElementById('regPhone').value.trim();
    const verificationCode = document.getElementById('regCode').value.trim();
    if (!name || !phone || !verificationCode) {
      showAuthError('register', '请填写姓名、手机号和短信验证码');
      return;
    }
    if (password && password.length < 6) {
      showAuthError('register', '密码至少需要 6 位');
      return;
    }
    const result = await APP.register(name, email, password, phone, verificationCode);
    if (result.ok) {
      hideModal('modalRegister');
      updateNav();
      // 检查是否有待跳转的报告类型
      const pending = window._pendingReportType;
      if (pending) {
        window._pendingReportType = null;
        toast(`欢迎，${name}！正在跳转到问卷填写…`, 'success', 3000);
        setTimeout(() => showPage('questionnaire', { reportType: pending }), 400);
      } else {
        toast(`欢迎，${name}！账户已创建成功，请选择要生成的报告类型 👇`, 'success', 4500);
        setTimeout(() => {
          showPage('home');
          setTimeout(() => {
            const sec = document.getElementById('reportsSection');
            if (sec) sec.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }, 300);
      }
    } else {
      showAuthError('register', result.msg);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setFormNotice('loginFormNotice', '');
    const phone = document.getElementById('loginPhone').value.trim();
    const verificationCode = document.getElementById('loginCode').value.trim();
    if (!phone || !verificationCode) {
      showAuthError('login', '请填写手机号和验证码');
      return;
    }
    const result = await APP.login(phone, '', verificationCode);
    if (result.ok) {
      hideModal('modalLogin');
      updateNav();
      // 检查是否有待跳转的报告类型
      const pending = window._pendingReportType;
      if (pending) {
        window._pendingReportType = null;
        toast(`欢迎回来，${APP.state.user.name}！正在跳转到问卷填写…`, 'success', 3000);
        setTimeout(() => showPage('questionnaire', { reportType: pending }), 400);
      } else {
        toast(`欢迎回来，${APP.state.user.name}！请选择要生成的报告类型 👇`, 'success', 4500);
        setTimeout(() => {
          showPage('home');
          setTimeout(() => {
            const sec = document.getElementById('reportsSection');
            if (sec) sec.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }, 300);
      }
    } else {
      showAuthError('login', result.msg);
    }
  }

  async function sendRegisterCode() {
    setFormNotice('registerFormNotice', '');
    const phone = document.getElementById('regPhone').value.trim();
    if (!phone) return showAuthError('register', '请先填写手机号');
    await sendCode(phone, 'register');
  }

  async function sendLoginCode() {
    setFormNotice('loginFormNotice', '');
    const phone = document.getElementById('loginPhone').value.trim();
    if (!phone) return showAuthError('login', '请先填写手机号');
    await sendCode(phone, 'login');
  }

  async function sendCode(phone, purpose) {
    try {
      const result = await APP.sendVerificationCode(phone, purpose);
      setFormNotice(purpose === 'register' ? 'registerFormNotice' : 'loginFormNotice', result.mockCode ? `测试验证码：${result.mockCode}` : '验证码已发送，请注意查收', 'success');
      toast(result.mockCode ? `验证码已生成：${result.mockCode}` : '验证码已发送，请注意查收', 'success');
    } catch (err) {
      showAuthError(purpose, err?.message || '验证码发送失败，请稍后重试');
    }
  }

  function showAuthError(scope, message) {
    const text = normalizeUserMessage(message);
    setFormNotice(scope === 'register' ? 'registerFormNotice' : 'loginFormNotice', text);
    toast(text, 'error');
  }

  function setFormNotice(id, message, type = 'error') {
    const el = document.getElementById(id);
    if (!el) return;
    if (!message) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = 'block';
    el.style.color = type === 'success' ? 'var(--success)' : 'var(--error)';
    el.textContent = message;
  }

  function normalizeUserMessage(message) {
    const text = String(message || '').replace(/^Error:\s*/i, '');
    if (text.includes('发送过于频繁')) return '验证码发送过于频繁，请稍后再试';
    if (text.includes('验证码错误')) return '验证码错误，请检查后重试';
    if (text.includes('已注册')) return '该手机号已注册，请直接登录';
    if (text.includes('已过期')) return '验证码已过期，请重新获取';
    return text || '操作失败，请稍后重试';
  }

  // ---- Questionnaire ----
  let qState = {
    reportType: null,
    currentStep: 0,
    data: {},
  };

  function renderQuestionnaire(reportType) {
    qState.reportType = reportType;
    qState.currentStep = 0;
    qState.data = {};
    renderQStep();
  }

  function renderQStep() {
    const steps = APP.getQuestionnaireSteps(qState.reportType);
    const step = steps[qState.currentStep];
    const total = steps.length;
    const pct = Math.round(((qState.currentStep) / total) * 100);

    // Update progress
    document.getElementById('qProgressFill').style.width = pct + '%';
    document.getElementById('qProgressPct').textContent = pct + '%';
    document.getElementById('qStepText').textContent = `步骤 ${qState.currentStep + 1} / ${total}`;

    // Report type header
    const rt = APP.REPORT_TYPES[qState.reportType];
    document.getElementById('qReportTypeName').textContent = rt ? rt.name : '评估问卷';

    // Section title
    document.getElementById('qSectionTitle').textContent = step.title;
    document.getElementById('qSectionDesc').textContent = step.desc;

    // Insight card
    document.getElementById('qInsightText').innerHTML =
      `<strong>系统提示：</strong>${step.insight}`;

    // Fields
    const container = document.getElementById('qFieldsContainer');
    container.innerHTML = '';
    step.fields.forEach(f => {
      container.appendChild(buildFieldEl(f));
    });

    // Restore saved data
    restoreStepData(step.fields);

    // 初始化条件显现（在 restore 之后，保证已保存数据能正确触发显隐）
    initConditionals();

    // Nav buttons
    document.getElementById('qBtnPrev').style.display = qState.currentStep === 0 ? 'none' : 'flex';
    document.getElementById('qBtnNext').textContent =
      qState.currentStep === total - 1 ? '生成报告 →' : '下一步 →';
  }

  function buildFieldEl(field) {
    const wrapper = document.createElement('div');
    wrapper.className = 'q-card';
    // 条件显现：初始状态处理
    if (field.showIf) {
      wrapper.dataset.showIfField = field.showIf.field;
      if (field.showIf.value) wrapper.dataset.showIfValue = field.showIf.value;
      if (field.showIf.includes) wrapper.dataset.showIfIncludes = field.showIf.includes;
      wrapper.style.display = 'none'; // 初始隐藏，等 evalConditionals 处理
    }

    const label = document.createElement('div');
    label.className = 'q-label';
    label.innerHTML = field.label + (field.required ? '<span class="q-required">*</span>' : '');
    wrapper.appendChild(label);

    if (field.type === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-input';
      input.placeholder = field.placeholder || '';
      input.dataset.fieldId = field.id;
      input.addEventListener('input', () => saveFieldData(field.id, input.value));
      wrapper.appendChild(input);

    } else if (field.type === 'select') {
      const sel = document.createElement('select');
      sel.className = 'q-select';
      sel.dataset.fieldId = field.id;
      sel.innerHTML = '<option value="">请选择…</option>';
      field.options.forEach(opt => {
        sel.innerHTML += `<option value="${opt}">${opt}</option>`;
      });
      sel.addEventListener('change', () => saveFieldData(field.id, sel.value));
      wrapper.appendChild(sel);

    } else if (field.type === 'radio') {
      const optionsEl = document.createElement('div');
      optionsEl.className = 'q-options';
      field.options.forEach(opt => {
        const optEl = document.createElement('label');
        optEl.className = 'q-option';
        optEl.innerHTML = `
          <input type="radio" name="${field.id}" value="${opt}">
          <span class="q-option-check"></span>
          <span>${opt}</span>
        `;
        optEl.addEventListener('click', () => {
          optionsEl.querySelectorAll('.q-option').forEach(o => o.classList.remove('selected'));
          optEl.classList.add('selected');
          saveFieldData(field.id, opt);
          // 触发条件显现重新评估
          evalConditionals(field.id, opt);
        });
        optionsEl.appendChild(optEl);
      });
      wrapper.appendChild(optionsEl);

    } else if (field.type === 'checkbox') {
      const maxSelect = field.maxSelect || null;
      // 添加最多可选提示
      if (maxSelect) {
        const hint = document.createElement('div');
        hint.className = 'q-hint';
        hint.style.cssText = 'font-size:12px;color:var(--gray-400);margin-bottom:8px';
        hint.textContent = `最多可选 ${maxSelect} 项`;
        wrapper.appendChild(hint);
      }
      const optionsEl = document.createElement('div');
      optionsEl.className = 'q-options';
      field.options.forEach(opt => {
        const optEl = document.createElement('label');
        optEl.className = 'q-option';
        optEl.innerHTML = `
          <input type="checkbox" name="${field.id}" value="${opt}">
          <span class="q-option-check" style="border-radius:3px"></span>
          <span>${opt}</span>
        `;
        const cb = optEl.querySelector('input');
        optEl.addEventListener('click', (e) => {
          const currentSelected = [...optionsEl.querySelectorAll('input:checked')];
          // 如果当前是未选中状态，且已选数量达到上限，则阻止选择
          if (!cb.checked && maxSelect && currentSelected.length >= maxSelect) {
            e.preventDefault();
            toast(`最多只能选 ${maxSelect} 项`, 'warning', 2000);
            return;
          }
          cb.checked = !cb.checked;
          optEl.classList.toggle('selected', cb.checked);
          const selected = [...optionsEl.querySelectorAll('input:checked')].map(i => i.value);
          saveFieldData(field.id, selected);
          // checkbox 变化也触发条件显现评估
          evalConditionals(field.id, selected);
        });
        optionsEl.appendChild(optEl);
      });
      wrapper.appendChild(optionsEl);

    } else if (field.type === 'textarea') {
      const ta = document.createElement('textarea');
      ta.className = 'q-textarea';
      ta.placeholder = field.placeholder || '';
      ta.dataset.fieldId = field.id;
      ta.addEventListener('input', () => saveFieldData(field.id, ta.value));
      wrapper.appendChild(ta);
    }

    return wrapper;
  }

  // 评估并更新当前步骤内所有条件显现字段的可见性
  function evalConditionals(changedFieldId, newValue) {
    const container = document.getElementById('qFieldsContainer');
    if (!container) return;
    container.querySelectorAll('[data-show-if-field]').forEach(el => {
      const targetField = el.dataset.showIfField;
      if (targetField !== changedFieldId) return;
      const requiredValue = el.dataset.showIfValue;
      const requiredIncludes = el.dataset.showIfIncludes;
      let shouldShow = false;
      if (requiredValue) {
        shouldShow = (newValue === requiredValue);
      } else if (requiredIncludes) {
        shouldShow = Array.isArray(newValue)
          ? newValue.includes(requiredIncludes)
          : newValue === requiredIncludes;
      }
      el.style.display = shouldShow ? '' : 'none';
    });
  }

  // 根据已保存数据初始化当前步骤的条件显现状态
  function initConditionals() {
    const steps = APP.getQuestionnaireSteps(qState.reportType);
    const stepId = steps[qState.currentStep].id;
    const saved = qState.data[stepId] || {};
    Object.entries(saved).forEach(([fieldId, value]) => {
      evalConditionals(fieldId, value);
    });
  }

  function saveFieldData(fieldId, value) {
    const steps = APP.getQuestionnaireSteps(qState.reportType);
    const stepId = steps[qState.currentStep].id;
    if (!qState.data[stepId]) qState.data[stepId] = {};
    qState.data[stepId][fieldId] = value;
  }

  function restoreStepData(fields) {
    const steps = APP.getQuestionnaireSteps(qState.reportType);
    const stepId = steps[qState.currentStep].id;
    const saved = qState.data[stepId] || {};
    fields.forEach(f => {
      const val = saved[f.id];
      if (val === undefined) return;
      if (f.type === 'text') {
        const el = document.querySelector(`[data-field-id="${f.id}"]`);
        if (el) el.value = val;
      } else if (f.type === 'select') {
        const el = document.querySelector(`select[data-field-id="${f.id}"]`);
        if (el) el.value = val;
      } else if (f.type === 'radio') {
        const card = document.querySelector(`.q-card`);
        document.querySelectorAll(`input[name="${f.id}"]`).forEach(inp => {
          if (inp.value === val) {
            inp.closest('.q-option').classList.add('selected');
          }
        });
      } else if (f.type === 'checkbox' && Array.isArray(val)) {
        val.forEach(v => {
          document.querySelectorAll(`input[name="${f.id}"]`).forEach(inp => {
            if (inp.value === v) {
              inp.checked = true;
              inp.closest('.q-option').classList.add('selected');
            }
          });
        });
      } else if (f.type === 'textarea') {
        const el = document.querySelector(`textarea[data-field-id="${f.id}"]`);
        if (el) el.value = val;
      }
    });
  }

  function qNext() {
    const steps = APP.getQuestionnaireSteps(qState.reportType);
    const total = steps.length;

    if (qState.currentStep < total - 1) {
      qState.currentStep++;
      renderQStep();
      document.getElementById('questionnaireBody').scrollTop = 0;
    } else {
      // Submit — go to generating
      if (!APP.isLoggedIn()) {
        toast('请先登录或注册，以保存您的报告', 'warning');
        showModal('modalLogin');
        return;
      }
      showPage('generating', {
        reportType: qState.reportType,
        questionnaireData: qState.data,
      });
    }
  }

  function qPrev() {
    if (qState.currentStep > 0) {
      qState.currentStep--;
      renderQStep();
    }
  }

  // ---- Generating Page ----
  const GENERATION_STEPS = [
    '正在归一化问卷数据…',
    '正在构建用户画像模型…',
    '正在抽取关键评估维度…',
    '调用智能评估引擎…',
    '正在生成结构化分析结果…',
    '正在生成最终报告文案…',
    '正在计算图表数据…',
    '正在完成报告并发放代金券…',
  ];

  let generatingParams = null;

  async function startGeneration(params) {
    generatingParams = params;
    try {
      const hasAccess = await APP.hasReportAccess();
      if (!hasAccess) {
        openEntitlementRequiredModal('当前账户没有可用报告权益或有效会员，请先兑换权益或前往荔智惠购买。');
        return;
      }
    } catch (err) {
      const message = err?.message || '';
      if (message.includes('权益') || message.includes('会员') || message.includes('402')) {
        openEntitlementRequiredModal(message);
        return;
      }
    }
    const rt = APP.REPORT_TYPES[params.reportType];
    document.getElementById('genReportName').textContent = rt ? rt.name : '报告';
    document.getElementById('genIcon').textContent = rt ? rt.emoji : '📊';

    const stepsContainer = document.getElementById('genSteps');
    stepsContainer.innerHTML = '';
    GENERATION_STEPS.forEach((s, i) => {
      stepsContainer.innerHTML += `
        <div class="generating-step" id="genStep${i}">
          <div class="generating-step-icon">◌</div>
          <span>${s}</span>
        </div>
      `;
    });

    runGenerationAnimation(params);
  }

  async function runGenerationAnimation(params) {
    const stepEls = document.querySelectorAll('.generating-step');
    const stepDelay = 900;

    // Animate steps except last
    for (let i = 0; i < stepEls.length - 1; i++) {
      stepEls[i].classList.add('active');
      stepEls[i].querySelector('.generating-step-icon').textContent = '↻';
      await delay(stepDelay);
      stepEls[i].classList.remove('active');
      stepEls[i].classList.add('done');
      stepEls[i].querySelector('.generating-step-icon').textContent = '✓';
    }

    // Activate last step (actual API call)
    const lastIdx = stepEls.length - 1;
    stepEls[lastIdx].classList.add('active');
    stepEls[lastIdx].querySelector('.generating-step-icon').textContent = '↻';

    try {
      // Flatten questionnaire data
      const flatData = {};
      Object.values(params.questionnaireData).forEach(stepData => {
        Object.assign(flatData, stepData);
      });

      const { report, voucher } = await APP.generateReport(params.reportType, flatData);

      stepEls[lastIdx].classList.remove('active');
      stepEls[lastIdx].classList.add('done');
      stepEls[lastIdx].querySelector('.generating-step-icon').textContent = '✓';

      await delay(600);

      // Show completion notification
      toast(voucher ? `🎉 报告生成完成！已向您账户发放 ¥${voucher.amount} 代金券` : '🎉 报告生成完成！本次已使用您的报告权益', 'success', 5000);

      // Navigate to report page
      showPage('report', { reportId: report.id });
    } catch(err) {
      stepEls[lastIdx].classList.remove('active');
      const message = err?.message || '报告生成遇到问题，请稍后重试';
      if (message.includes('权益') || message.includes('会员') || message.includes('402')) {
        openEntitlementRequiredModal(message);
      } else {
        toast(message, 'error');
      }
    }
  }

  function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  // ---- Report Page ----
  async function renderReportPage(reportId) {
    let report = APP.state.reports.find(r => r.id === reportId);
    if (!report || !report.reportData) {
      try {
        report = await APP.fetchReport(reportId);
      } catch (e) {
        toast(e.message || '报告加载失败', 'error');
      }
    }
    if (!report) {
      showPage('home');
      return;
    }

    const rt = report.typeInfo;
    const data = report.reportData;

    // Header
    document.getElementById('reportTypeBadge').textContent = rt.name;
    document.getElementById('reportTitle').textContent = rt.name;
    document.getElementById('reportDate').textContent = new Date(report.createdAt).toLocaleDateString('zh-CN');
    document.getElementById('reportEngine').textContent = rt.engine;

    const body = document.getElementById('reportBody');
    body.innerHTML = '';

    if (report.type === 'competitiveness') {
      renderCompetitivenessReport(body, data, report);
    } else if (report.type === 'family') {
      renderFamilyReport(body, data, report);
    } else if (report.type === 'career') {
      renderCareerReport(body, data, report);
    }

    // Find voucher for this report
    const voucher = APP.state.vouchers.find(v => v.reportId === reportId);
    if (voucher) {
      const voucherEl = document.getElementById('reportVoucher');
      voucherEl.classList.remove('hidden');
      document.getElementById('reportVoucherAmount').textContent = voucher.amount;
      document.getElementById('reportVoucherCode').textContent = voucher.code;
      const exp = new Date(voucher.expiresAt).toLocaleDateString('zh-CN');
      document.getElementById('reportVoucherExpiry').textContent = `有效期至：${exp}`;
    }
  }

  function renderCompetitivenessReport(body, data, report) {
    const html = [];
    const score = Number.isFinite(Number(data.overallScore)) ? Number(data.overallScore) : 70;
    const scoringDimensions = Object.keys(data.scoringDimensions || {}).length ? data.scoringDimensions : {
      academics: 70,
      testScores: 70,
      majorFit: 70,
      backgroundDepth: 68,
      highVisibility: 65,
      narrativeMaturity: 68,
    };

    // 1. 综合评分 + 雷达图
    html.push(`
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon" style="background:#e8f0f9">📊</div>
          <div class="report-section-title">综合竞争力评分</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:center">
          <div>
            <div style="font-size:80px;font-weight:700;font-family:var(--font-serif);color:var(--navy-500);line-height:1">
              ${score}<span style="font-size:24px;color:var(--gray-400)"> / 100</span>
            </div>
            <div style="font-size:14px;color:var(--gray-400);margin-top:8px">AI 综合竞争力指数</div>
            <div style="margin-top:16px">${getScoreLabel(score)}</div>
            <div style="margin-top:20px;display:flex;flex-direction:column;gap:8px">
              ${Object.entries(scoringDimensions).map(([k, v]) => {
                const dimLabels = { academics: '学术基础', testScores: '语言/标化竞争力', majorFit: '专业匹配度', backgroundDepth: '背景完整度', highVisibility: '高辨识度成果', narrativeMaturity: '申请叙事成熟度' };
                return `<div>
                  <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--gray-500);margin-bottom:3px">
                    <span>${dimLabels[k] || k}</span><span style="font-weight:600;color:var(--navy-500)">${v}</span>
                  </div>
                  <div style="height:5px;background:var(--gray-100);border-radius:99px;overflow:hidden">
                    <div style="height:100%;width:${v}%;background:${v >= 80 ? 'var(--success)' : v >= 60 ? 'var(--navy-400)' : 'var(--warning)'};border-radius:99px"></div>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
          <div class="chart-canvas-wrap">
            <canvas id="radarChart" width="280" height="280"></canvas>
          </div>
        </div>
      </div>
    `);

    // 2. 报告摘要
    html.push(`
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon" style="background:#fef9ee">🔍</div>
          <div class="report-section-title">报告摘要</div>
        </div>
        <div class="report-summary-box">
          <div class="report-summary-label">AI 核心判断</div>
          <div class="report-summary-text">${data.reportSummary || data.summary || ''}</div>
        </div>
      </div>
    `);

    if (data.genericSections && data.genericSections.length) {
      html.push(`
        <div class="report-section">
          <div class="report-section-header">
            <div class="report-section-icon" style="background:#e8f0f9">📌</div>
            <div class="report-section-title">详细分析</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${data.genericSections.map(section => `
              <div style="padding:16px;background:var(--gray-50);border-radius:var(--radius-lg);border:1px solid var(--gray-100)">
                <div style="font-size:15px;font-weight:700;color:var(--gray-800);margin-bottom:8px">${section.title || section.key || '分析模块'}</div>
                <div style="font-size:14px;color:var(--gray-600);line-height:1.8">${String(section.content || section.summary || '').replace(/\n/g, '<br>')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `);
    }

    // 3. 申请竞争力判断
    if (data.competitivenessAnalysis) {
      html.push(`
        <div class="report-section">
          <div class="report-section-header">
            <div class="report-section-icon" style="background:#e8f0f9">🎯</div>
            <div class="report-section-title">当前申请竞争力判断</div>
          </div>
          <div style="font-size:14px;color:var(--gray-700);line-height:1.85">${data.competitivenessAnalysis.replace(/\n/g, '<br>')}</div>
        </div>
      `);
    }

    // 4. 院校匹配建议（卡片模式）
    const sr = data.schoolRecommendations || {};
    html.push(`
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon" style="background:#e8f0f9">🏫</div>
          <div class="report-section-title">冲刺院校与匹配院校分析</div>
        </div>
        ${sr.schoolAnalysisText ? `<div style="font-size:14px;color:var(--gray-700);line-height:1.85;margin-bottom:24px">${sr.schoolAnalysisText.replace(/\n/g, '<br>')}</div>` : ''}
        <div style="margin-bottom:12px;font-size:13px;font-weight:600;color:var(--gray-500);letter-spacing:0.5px">冲刺院校（Reach）</div>
        <div class="school-grid" style="margin-bottom:24px">
          ${(sr.reach || data.reachSchools || []).length ? (sr.reach || data.reachSchools || []).map(s => `
            <div class="school-card reach">
              <div class="school-rank reach">冲刺</div>
              <div class="school-name">${s.name}</div>
              <div class="school-qs">${s.country} · ${s.qs}</div>
              <div style="font-size:12px;color:var(--gray-400);margin-top:4px">${s.whyReach || s.note || ''}</div>
              <div style="margin-top:8px">
                <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray-400);margin-bottom:4px">
                  <span>匹配度</span><span>${s.matchScore}%</span>
                </div>
                <div style="height:4px;background:var(--gray-100);border-radius:99px;overflow:hidden">
                  <div style="height:100%;width:${s.matchScore}%;background:#ef4444;border-radius:99px"></div>
                </div>
              </div>
            </div>
          `).join('') : '<div style="font-size:13px;color:var(--gray-400);padding:14px;background:var(--gray-50);border-radius:var(--radius-lg)">模型本次未返回明确冲刺院校，请结合摘要与后续顾问建议进一步确认。</div>'}
        </div>
        <div style="margin-bottom:12px;font-size:13px;font-weight:600;color:var(--gray-500);letter-spacing:0.5px">匹配院校（Match）</div>
        <div class="school-grid">
          ${(sr.match || data.matchSchools || []).length ? (sr.match || data.matchSchools || []).map(s => `
            <div class="school-card match">
              <div class="school-rank match">匹配</div>
              <div class="school-name">${s.name}</div>
              <div class="school-qs">${s.country} · ${s.qs}</div>
              <div style="font-size:12px;color:var(--gray-400);margin-top:4px">${s.whyMatch || s.note || ''}</div>
              <div style="margin-top:8px">
                <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--gray-400);margin-bottom:4px">
                  <span>匹配度</span><span>${s.matchScore}%</span>
                </div>
                <div style="height:4px;background:var(--gray-100);border-radius:99px;overflow:hidden">
                  <div style="height:100%;width:${s.matchScore}%;background:#f59e0b;border-radius:99px"></div>
                </div>
              </div>
            </div>
          `).join('') : '<div style="font-size:13px;color:var(--gray-400);padding:14px;background:var(--gray-50);border-radius:var(--radius-lg)">模型本次未返回明确匹配院校，建议补充目标国家、专业和成绩后重新生成。</div>'}
        </div>
      </div>
    `);

    // 5. 短板分析 + 优先级矩阵
    const ga = data.gapAnalysis || {};
    html.push(`
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon" style="background:#fef2f2">⚠️</div>
          <div class="report-section-title">当前核心短板与风险</div>
        </div>
        <div class="gap-list" style="margin-bottom:${ga.gapAnalysisText ? '20px' : '0'}">
          ${(ga.keyGaps || data.keyGaps || []).map(g => `
            <div class="gap-item">
              <div class="gap-item-dot ${g.level}"></div>
              <div class="gap-item-text">
                <strong>${g.title}</strong>：${g.desc}
                ${g.impactOnResult ? `<div style="margin-top:4px;font-size:12px;color:var(--error);background:#fef2f2;padding:4px 8px;border-radius:4px">影响：${g.impactOnResult}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
        ${ga.gapAnalysisText ? `<div style="font-size:14px;color:var(--gray-700);line-height:1.85">${ga.gapAnalysisText.replace(/\n/g, '<br>')}</div>` : ''}
      </div>
    `);

    // 6. 目标专业风险指数
    html.push(`
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon" style="background:#e8f0f9">📈</div>
          <div class="report-section-title">目标专业风险指数</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px">
          ${(data.targetMajorRisk || []).map(m => {
            const risk = m.riskScore || m.risk || 0;
            const level = m.riskLevel || (risk >= 70 ? '高风险' : risk >= 40 ? '中风险' : '低风险');
            const color = level === '高风险' ? '#ef4444' : level === '中风险' ? '#f59e0b' : '#22c55e';
            return `<div style="padding:14px 16px;border:1px solid var(--gray-100);border-radius:var(--radius-lg);display:flex;align-items:center;gap:16px">
              <div style="flex:1">
                <div style="font-size:14px;font-weight:600;color:var(--gray-800);margin-bottom:6px">${m.major}</div>
                <div style="height:6px;background:var(--gray-100);border-radius:99px;overflow:hidden">
                  <div style="height:100%;width:${risk}%;background:${color};border-radius:99px"></div>
                </div>
                <div style="font-size:12px;color:var(--gray-500);margin-top:5px">${m.riskNote || m.note || ''}</div>
              </div>
              <div style="flex-shrink:0;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:700;color:white;background:${color}">${level}</div>
            </div>`;
          }).join('')}
        </div>
        <div style="max-width:500px"><canvas id="riskChart" height="200"></canvas></div>
      </div>
    `);

    // 7. 短板优先级矩阵（气泡感列表）
    if (data.priorityMatrix && data.priorityMatrix.length) {
      html.push(`
        <div class="report-section">
          <div class="report-section-header">
            <div class="report-section-icon" style="background:#fef9ee">🧩</div>
            <div class="report-section-title">背景短板优先级矩阵</div>
          </div>
          <div style="font-size:12px;color:var(--gray-400);margin-bottom:12px">横轴：对申请结果影响程度　纵轴：可改善程度</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${data.priorityMatrix.sort((a,b) => (b.impactScore - a.impactScore)).map(m => {
              const prioColor = m.priority === 'high' ? '#ef4444' : m.priority === 'medium' ? '#f59e0b' : '#9ca3af';
              return `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--gray-50);border-radius:var(--radius-lg);border-left:3px solid ${prioColor}">
                <div style="flex:1;font-size:13px;font-weight:600;color:var(--gray-800)">${m.item}</div>
                <div style="display:flex;gap:16px;flex-shrink:0">
                  <div style="text-align:center">
                    <div style="font-size:10px;color:var(--gray-400)">影响程度</div>
                    <div style="font-size:15px;font-weight:700;color:var(--gray-700)">${m.impactScore}</div>
                  </div>
                  <div style="text-align:center">
                    <div style="font-size:10px;color:var(--gray-400)">可改善度</div>
                    <div style="font-size:15px;font-weight:700;color:var(--gray-700)">${m.feasibilityScore}</div>
                  </div>
                  <div style="padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700;color:white;background:${prioColor};align-self:center">${m.priority === 'high' ? '优先' : m.priority === 'medium' ? '次优先' : '可缓'}</div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      `);
    }

    // 8. 下一阶段补强建议
    const rp = data.reinforcementPlan || {};
    html.push(`
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon" style="background:#ecfdf5">✅</div>
          <div class="report-section-title">下一阶段最值得投入的补强方向</div>
        </div>
        ${rp.reinforcementText ? `<div style="font-size:14px;color:var(--gray-700);line-height:1.85;margin-bottom:20px">${rp.reinforcementText.replace(/\n/g, '<br>')}</div>` : ''}
        ${(rp.topActions || data.recommendations || []).length ? `
          <div style="display:flex;flex-direction:column;gap:10px">
            ${(rp.topActions || data.recommendations || []).map((a, i) => `
              <div style="display:flex;gap:14px;padding:14px 16px;background:var(--gray-50);border-radius:var(--radius-lg)">
                <div style="width:26px;height:26px;border-radius:50%;background:var(--navy-500);color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${i+1}</div>
                <div>
                  <div style="font-size:14px;font-weight:600;color:var(--gray-800);margin-bottom:3px">${a.action || a.title || a.step || a.recommendation || '建议事项'}</div>
                  <div style="font-size:13px;color:var(--gray-500);line-height:1.6">${a.timeline ? `<span style="font-size:11px;background:var(--navy-50);color:var(--navy-500);padding:1px 8px;border-radius:99px;margin-right:6px">${a.timeline}</span>` : ''}${a.expectedImpact || a.desc || a.description || a.content || ''}</div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `);

    // 9. 结语
    if (data.conclusion) {
      html.push(`
        <div class="report-section" style="background:linear-gradient(135deg,var(--navy-900),var(--navy-800));border-radius:var(--radius-2xl)">
          <div style="font-size:14px;color:rgba(255,255,255,0.75);line-height:1.85">${data.conclusion.replace(/\n/g, '<br>')}</div>
          <div style="margin-top:16px;padding:12px 16px;background:rgba(255,255,255,0.08);border-radius:var(--radius-lg);font-size:13px;color:var(--gold-300)">
            💡 持有本报告代金券，可在荔智惠小程序预约专属战略咨询，抵扣咨询费用
          </div>
        </div>
      `);
    }

    body.innerHTML = html.join('');
    setTimeout(() => {
      renderRadarChart(scoringDimensions);
      renderRiskChart(data.targetMajorRisk);
    }, 100);
  }

  function renderFamilyReport(body, data, report) {
    const html = [];

    // 模块1：执行摘要
    if (data.executiveSummary) {
      html.push(`
        <div class="report-section">
          <div class="report-section-header">
            <div class="report-section-icon" style="background:#fef9ee">📋</div>
            <div class="report-section-title">执行摘要</div>
          </div>
          <div style="font-size:14px;color:var(--gray-700);line-height:1.85">${data.executiveSummary.replace(/\n/g, '<br>')}</div>
        </div>
      `);
    }

    // 模块2：家庭教育目标画像
    if (data.familyGoalRadar || data.familyGoalText) {
      html.push(`
        <div class="report-section">
          <div class="report-section-header">
            <div class="report-section-icon" style="background:#fef9ee">🎯</div>
            <div class="report-section-title">家庭教育目标画像</div>
          </div>
          ${data.familyGoalText ? `<div style="font-size:14px;color:var(--gray-700);line-height:1.85;margin-bottom:20px">${data.familyGoalText.replace(/\n/g, '<br>')}</div>` : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:center">
            <div>
              ${data.familyGoalRadar ? Object.entries(data.familyGoalRadar).map(([k, v]) => {
                const dimLabels = { rankOriented: '名校导向', valueOriented: '性价比导向', stabilityOriented: '稳定性导向', globalOriented: '国际化导向', careerOriented: '就业导向', growthOriented: '长期成长导向' };
                return `<div style="margin-bottom:8px">
                  <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--gray-500);margin-bottom:3px">
                    <span>${dimLabels[k] || k}</span><span style="font-weight:600">${v}</span>
                  </div>
                  <div style="height:5px;background:var(--gray-100);border-radius:99px;overflow:hidden">
                    <div style="height:100%;width:${v}%;background:var(--gold-400);border-radius:99px"></div>
                  </div>
                </div>`;
              }).join('') : ''}
            </div>
            <div class="chart-canvas-wrap">
              <canvas id="familyGoalRadar" width="260" height="260"></canvas>
            </div>
          </div>
        </div>
      `);
    }

    // 模块3：学生画像与亲子目标一致性分析
    if (data.studentProfileText || data.alignmentRadar || data.alignmentText) {
      html.push(`
        <div class="report-section">
          <div class="report-section-header">
            <div class="report-section-icon" style="background:#e8f0f9">🤝</div>
            <div class="report-section-title">学生画像与亲子目标一致性分析</div>
          </div>
          ${data.studentProfileText ? `<div style="font-size:14px;color:var(--gray-700);line-height:1.85;margin-bottom:20px">${data.studentProfileText.replace(/\n/g, '<br>')}</div>` : ''}
          ${data.alignmentText ? `<div style="font-size:14px;color:var(--gray-700);line-height:1.85;margin-bottom:20px">${data.alignmentText.replace(/\n/g, '<br>')}</div>` : ''}
          ${data.alignmentRadar ? `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:center">
              <div>
                ${Object.entries(data.alignmentRadar).map(([k, v]) => {
                  const labels = { countryChoice: '国家选择', schoolTier: '学校层级', majorDirection: '专业方向', investmentExpect: '投入强度', riskPreference: '风险偏好' };
                  const c = v >= 80 ? 'var(--success)' : v >= 60 ? 'var(--warning)' : 'var(--error)';
                  return `<div style="margin-bottom:8px">
                    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--gray-500);margin-bottom:3px">
                      <span>${labels[k]||k}</span><span style="font-weight:600;color:${c}">${v}%</span>
                    </div>
                    <div style="height:5px;background:var(--gray-100);border-radius:99px;overflow:hidden">
                      <div style="height:100%;width:${v}%;background:${c};border-radius:99px"></div>
                    </div>
                  </div>`;
                }).join('')}
              </div>
              <div class="chart-canvas-wrap"><canvas id="alignmentRadar" width="240" height="240"></canvas></div>
            </div>
          ` : ''}
        </div>
      `);
    }

    // 模块4：国家/地区路径判断
    if (data.countryPathComparison || data.countryPathText) {
      html.push(`
        <div class="report-section">
          <div class="report-section-header">
            <div class="report-section-icon" style="background:#e8f0f9">🌍</div>
            <div class="report-section-title">国家/地区路径判断</div>
          </div>
          ${data.countryPathText ? `<div style="font-size:14px;color:var(--gray-700);line-height:1.85;margin-bottom:20px">${data.countryPathText.replace(/\n/g, '<br>')}</div>` : ''}
          <canvas id="countryChart" height="220" style="margin-bottom:20px"></canvas>
          <div style="display:flex;flex-direction:column;gap:12px">
            ${(data.countryPathComparison || []).map(c => `
              <div style="display:flex;align-items:center;gap:16px;padding:16px;border:1px solid var(--gray-100);border-radius:var(--radius-lg)">
                <div style="width:80px;text-align:center;flex-shrink:0">
                  <div style="font-size:22px;font-weight:700;font-family:var(--font-serif);color:var(--navy-500)">${c.costScore ?? ''}</div>
                  <div style="font-size:11px;color:var(--gray-400)">性价比</div>
                </div>
                <div style="width:1px;height:50px;background:var(--gray-100)"></div>
                <div style="flex:1">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <div style="font-size:15px;font-weight:600;color:var(--gray-800)">${c.country}</div>
                    <span style="padding:2px 10px;border-radius:99px;font-size:11px;font-weight:600;background:${c.recommendation === '优先推荐' ? 'var(--success-light)' : c.recommendation === '补充参考' ? 'var(--navy-50)' : 'var(--gray-100)'};color:${c.recommendation === '优先推荐' ? 'var(--success)' : c.recommendation === '补充参考' ? 'var(--navy-500)' : 'var(--gray-500)'}">${c.recommendation}</span>
                  </div>
                  <div style="font-size:12px;color:var(--gray-500)">${c.estimatedCost || ''}</div>
                  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
                    ${(c.pros||[]).slice(0,2).map(p=>`<span style="padding:2px 8px;background:var(--success-light);border-radius:99px;font-size:11px;color:var(--success)">+ ${p}</span>`).join('')}
                    ${(c.cons||[]).slice(0,1).map(p=>`<span style="padding:2px 8px;background:#fef2f2;border-radius:99px;font-size:11px;color:var(--error)">- ${p}</span>`).join('')}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `);
    }

    // 模块5：家庭资源投入建议
    if (data.resourceRadar || data.resourceText || (data.budgetMilestones || []).length) {
      html.push(`
        <div class="report-section">
          <div class="report-section-header">
            <div class="report-section-icon" style="background:#ecfdf5">💰</div>
            <div class="report-section-title">家庭资源投入建议</div>
          </div>
          ${data.resourceText ? `<div style="font-size:14px;color:var(--gray-700);line-height:1.85;margin-bottom:20px">${data.resourceText.replace(/\n/g, '<br>')}</div>` : ''}
          ${data.resourceRadar ? `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:center;margin-bottom:20px">
              <div>
                ${Object.entries(data.resourceRadar).map(([k,v]) => {
                  const labels = { academicInvest: '学业投入', testInvest: '标化投入', backgroundInvest: '背景提升', globalProjectInvest: '国际项目', longTermPlanInvest: '长期规划' };
                  return `<div style="margin-bottom:8px">
                    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--gray-500);margin-bottom:3px">
                      <span>${labels[k]||k}</span><span style="font-weight:600">${v}</span>
                    </div>
                    <div style="height:5px;background:var(--gray-100);border-radius:99px;overflow:hidden">
                      <div style="height:100%;width:${v}%;background:var(--navy-400);border-radius:99px"></div>
                    </div>
                  </div>`;
                }).join('')}
              </div>
              <div class="chart-canvas-wrap"><canvas id="resourceRadar" width="240" height="240"></canvas></div>
            </div>
          ` : ''}
          ${(data.budgetMilestones || []).length ? `
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--gray-500);margin-bottom:10px">预算里程碑</div>
              ${data.budgetMilestones.map(b => `
                <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;margin-bottom:8px;background:var(--gray-50);border-radius:var(--radius-lg)">
                  <div style="width:8px;height:8px;border-radius:50%;background:${b.priority==='high'?'var(--error)':b.priority==='medium'?'var(--warning)':'var(--success)'};flex-shrink:0"></div>
                  <div style="flex:1;font-size:13px;color:var(--gray-700)">${b.phase}：${b.item}</div>
                  <div style="font-size:13px;font-weight:600;color:var(--navy-500)">${b.amount}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `);
    }

    // 模块6：当前最关键的家庭决策问题
    if (data.keyDecision) {
      const kd = data.keyDecision;
      html.push(`
        <div class="report-section" style="background:var(--gray-50);border-left:4px solid var(--navy-500)">
          <div class="report-section-header">
            <div class="report-section-icon" style="background:#e8f0f9">🧭</div>
            <div class="report-section-title">当前最关键的家庭决策问题</div>
          </div>
          <div style="font-size:16px;font-weight:600;color:var(--navy-500);margin-bottom:16px">${kd.coreQuestion || ''}</div>
          ${kd.riskIfNotSolved ? `<div style="font-size:14px;color:var(--gray-700);line-height:1.85;margin-bottom:16px"><span style="font-weight:600;color:var(--error)">如不及时解决：</span>${kd.riskIfNotSolved.replace(/\n/g, '<br>')}</div>` : ''}
          ${kd.nextAction ? `<div style="font-size:14px;color:var(--gray-700);line-height:1.85"><span style="font-weight:600;color:var(--success)">建议下一步：</span>${kd.nextAction.replace(/\n/g, '<br>')}</div>` : ''}
        </div>
      `);
    }

    // 模块7：结语与代金券引导
    if (data.conclusion) {
      html.push(`
        <div class="report-section" style="background:linear-gradient(135deg,var(--navy-900),var(--navy-800));border-radius:var(--radius-2xl)">
          <div style="font-size:14px;color:rgba(255,255,255,0.75);line-height:1.85">${data.conclusion.replace(/\n/g, '<br>')}</div>
          <div style="margin-top:16px;padding:12px 16px;background:rgba(255,255,255,0.08);border-radius:var(--radius-lg);font-size:13px;color:var(--gold-300)">
            💡 持有本报告代金券，可在荔智惠小程序预约专属战略咨询，抵扣咨询费用
          </div>
        </div>
      `);
    }

    body.innerHTML = html.join('');
    setTimeout(() => {
      renderFamilyGoalRadar(data.familyGoalRadar);
      renderAlignmentRadar(data.alignmentRadar);
      renderCountryChart(data.countryPathComparison);
      renderResourceRadar(data.resourceRadar);
    }, 100);
  }

  function renderCareerReport(body, data, report) {
    const html = [];

    // 1. 成长画像雷达 + 摘要
    html.push(`
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon" style="background:#e8f0f9">🧭</div>
          <div class="report-section-title">长期发展摘要</div>
        </div>
        <div class="report-summary-box" style="margin-bottom:20px">
          <div class="report-summary-label">AI 核心判断</div>
          <div class="report-summary-text">${data.longTermSummary || data.personalProfile?.coreIdentity || ''}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:center">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--gray-500);margin-bottom:12px">个人成长画像</div>
            ${data.growthRadar ? Object.entries(data.growthRadar).map(([k,v]) => {
              const labels = { academicPotential: '学术潜力', practiceOrientation: '实践导向', analyticalAbility: '分析能力', communication: '表达与沟通', leadership: '领导力倾向', globalMindset: '国际化发展' };
              return `<div style="margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--gray-500);margin-bottom:3px">
                  <span>${labels[k]||k}</span><span style="font-weight:600">${v}</span>
                </div>
                <div style="height:5px;background:var(--gray-100);border-radius:99px;overflow:hidden">
                  <div style="height:100%;width:${v}%;background:var(--success);border-radius:99px"></div>
                </div>
              </div>`;
            }).join('') : ''}
          </div>
          <div class="chart-canvas-wrap"><canvas id="growthRadarChart" width="260" height="260"></canvas></div>
        </div>
      </div>
    `);

    // 2. 兴趣与能力标签
    html.push(`
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon" style="background:#fef9ee">🏷️</div>
          <div class="report-section-title">兴趣方向与能力标签</div>
        </div>
        ${(data.abilityTags || data.interestAndAbility?.interestTags) ? `
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
            ${(data.abilityTags || []).map(t => {
              const bg = t.type === 'strength' ? 'var(--success-light)' : t.type === 'gap' ? '#fef2f2' : 'var(--navy-50)';
              const color = t.type === 'strength' ? 'var(--success)' : t.type === 'gap' ? 'var(--error)' : 'var(--navy-500)';
              const bar = t.weight || 70;
              return `<div style="padding:8px 14px;background:${bg};border-radius:99px;font-size:13px;color:${color};font-weight:500;position:relative">
                ${t.tag}
                <span style="margin-left:6px;font-size:11px;opacity:0.7">${bar}</span>
              </div>`;
            }).join('')}
          </div>
        ` : ''}
        <div style="font-size:13px;font-weight:600;color:var(--gray-500);margin-bottom:8px">能力权重图</div>
        <div style="max-width:500px"><canvas id="abilityChart" height="200"></canvas></div>
      </div>
    `);

    // 3. 当前成长画像文字
    if (data.growthProfileText) {
      html.push(`
        <div class="report-section">
          <div class="report-section-header">
            <div class="report-section-icon" style="background:#e8f0f9">📝</div>
            <div class="report-section-title">当前成长画像</div>
          </div>
          <div style="font-size:14px;color:var(--gray-700);line-height:1.85">${data.growthProfileText.replace(/\n/g, '<br>')}</div>
        </div>
      `);
    }

    // 4. 兴趣方向判断
    if (data.interestDirectionText) {
      html.push(`
        <div class="report-section">
          <div class="report-section-header">
            <div class="report-section-icon" style="background:#fef9ee">🔭</div>
            <div class="report-section-title">兴趣与方向判断</div>
          </div>
          <div style="font-size:14px;color:var(--gray-700);line-height:1.85">${data.interestDirectionText.replace(/\n/g, '<br>')}</div>
        </div>
      `);
    }

    // 5. 职业路径树（学业+专业+职业）
    const cpt = data.careerPathTree || {};
    html.push(`
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon" style="background:#e8f0f9">🗺️</div>
          <div class="report-section-title">学业与职业路径建议</div>
        </div>
        ${data.academicCareerText ? `<div style="font-size:14px;color:var(--gray-700);line-height:1.85;margin-bottom:20px">${data.academicCareerText.replace(/\n/g, '<br>')}</div>` : ''}
        ${cpt.currentStage ? `<div style="font-size:12px;color:var(--gray-400);margin-bottom:12px">当前阶段：${cpt.currentStage}</div>` : ''}
        <div style="display:flex;flex-direction:column;gap:12px">
          ${(cpt.branches || []).map((b, i) => `
            <div style="padding:16px;border:1px solid var(--gray-100);border-radius:var(--radius-xl);border-left:3px solid var(--navy-${300+i*100 > 600 ? 600 : 300+i*100})">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
                <div style="font-size:15px;font-weight:600;color:var(--gray-800)">${b.pathName}</div>
                <span style="padding:2px 10px;background:var(--navy-50);border-radius:99px;font-size:11px;color:var(--navy-500);font-weight:600">匹配度 ${b.fitScore || b.probability || 0}%</span>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:12px">
                <div style="padding:8px;background:var(--gray-50);border-radius:var(--radius-lg)">
                  <div style="color:var(--gray-400);margin-bottom:3px">📚 学业路径</div>
                  <div style="color:var(--gray-700);font-weight:500">${b.studyPath || ''}</div>
                </div>
                <div style="padding:8px;background:var(--gray-50);border-radius:var(--radius-lg)">
                  <div style="color:var(--gray-400);margin-bottom:3px">🎓 专业方向</div>
                  <div style="color:var(--gray-700);font-weight:500">${b.majorPath || ''}</div>
                </div>
                <div style="padding:8px;background:var(--gray-50);border-radius:var(--radius-lg)">
                  <div style="color:var(--gray-400);margin-bottom:3px">💼 职业目标</div>
                  <div style="color:var(--gray-700);font-weight:500">${b.careerTarget || b.endCareer || ''}</div>
                </div>
              </div>
              ${b.keyMilestones ? `<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">${b.keyMilestones.map(m=>`<span style="font-size:11px;color:var(--gray-600);background:var(--gray-50);padding:3px 8px;border-radius:4px">· ${m}</span>`).join('')}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `);

    // 6. 能力缺口
    html.push(`
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon" style="background:#fef2f2">🔧</div>
          <div class="report-section-title">当前能力缺口</div>
        </div>
        ${data.capabilityGapText ? `<div style="font-size:14px;color:var(--gray-700);line-height:1.85;margin-bottom:20px">${data.capabilityGapText.replace(/\n/g, '<br>')}</div>` : ''}
        <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px">
          ${(data.capabilityGaps || []).map(g => {
            const urgColor = g.urgency === 'high' ? 'var(--error)' : g.urgency === 'medium' ? 'var(--warning)' : 'var(--success)';
            return `<div style="padding:14px 16px;background:var(--gray-50);border-radius:var(--radius-lg);border-left:3px solid ${urgColor}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <div style="font-size:14px;font-weight:600;color:var(--gray-800)">${g.capability}</div>
                <span style="font-size:11px;padding:2px 8px;border-radius:99px;color:white;background:${urgColor}">${g.urgency==='high'?'紧急':g.urgency==='medium'?'重要':'一般'}</span>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
                <div>
                  <div style="font-size:11px;color:var(--gray-400);margin-bottom:3px">当前水平</div>
                  <div style="height:6px;background:var(--gray-200);border-radius:99px;overflow:hidden">
                    <div style="height:100%;width:${g.currentLevel}%;background:var(--gray-400);border-radius:99px"></div>
                  </div>
                </div>
                <div>
                  <div style="font-size:11px;color:var(--gray-400);margin-bottom:3px">目标水平</div>
                  <div style="height:6px;background:var(--gray-200);border-radius:99px;overflow:hidden">
                    <div style="height:100%;width:${g.requiredLevel}%;background:var(--navy-400);border-radius:99px"></div>
                  </div>
                </div>
              </div>
              <div style="font-size:12px;color:var(--gray-500)">${g.whyImportant || g.developmentPlan || ''}${g.howToImprove ? ` ▶ ${g.howToImprove}` : ''}</div>
            </div>`;
          }).join('')}
        </div>
        <div style="max-width:500px"><canvas id="gapChart" height="220"></canvas></div>
      </div>
    `);

    // 7. 3-5 年成长时间轴
    html.push(`
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon" style="background:#ecfdf5">📅</div>
          <div class="report-section-title">未来 3–5 年成长建议</div>
        </div>
        ${data.fiveYearText ? `<div style="font-size:14px;color:var(--gray-700);line-height:1.85;margin-bottom:20px">${data.fiveYearText.replace(/\n/g, '<br>')}</div>` : ''}
        <div style="display:flex;flex-direction:column;gap:0">
          ${(data.fiveYearTimeline || []).map((t, i) => `
            <div style="display:flex;gap:16px">
              <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:40px">
                <div style="width:12px;height:12px;border-radius:50%;background:var(--navy-400);margin-top:18px"></div>
                ${i < (data.fiveYearTimeline.length-1) ? '<div style="flex:1;width:2px;background:var(--gray-100);margin:4px 0"></div>' : ''}
              </div>
              <div style="padding:14px 0 ${i < (data.fiveYearTimeline.length-1) ? '14px' : '0'}">
                <div style="font-size:12px;color:var(--navy-400);font-weight:700;margin-bottom:4px">${t.phase || t.year}</div>
                <div style="font-size:14px;font-weight:600;color:var(--gray-800);margin-bottom:6px">${t.focus}</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">
                  ${(t.keyActions || t.actions || []).map(a=>`<span style="font-size:12px;background:var(--gray-50);color:var(--gray-600);padding:2px 8px;border-radius:4px">· ${a}</span>`).join('')}
                </div>
                ${t.expectedOutcome || t.outcome ? `<div style="font-size:12px;color:var(--success);font-weight:500">→ ${t.expectedOutcome || t.outcome}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `);

    body.innerHTML = html.join('');
    setTimeout(() => {
      renderGrowthRadar(data.growthRadar);
      renderAbilityTagChart(data.abilityTags);
      renderGapChart(data.capabilityGaps);
    }, 100);
    // 5-Year Timeline
    html.push(`
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon" style="background:#ecfdf5">📅</div>
          <div class="report-section-title">3–5 年人生发展时间轴</div>
        </div>
        <div style="position:relative;padding-left:32px">
          <div style="position:absolute;left:10px;top:0;bottom:0;width:2px;background:var(--gray-100)"></div>
          ${(data.fiveYearTimeline || []).map((y, i) => `
            <div style="position:relative;margin-bottom:24px">
              <div style="position:absolute;left:-26px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--navy-${i === 0 ? '500' : '200'});border:2px solid white;box-shadow:0 0 0 3px var(--navy-${i === 0 ? '100' : '50'})"></div>
              <div style="font-size:12px;font-weight:700;color:var(--navy-500);margin-bottom:4px">${y.year}</div>
              <div style="font-size:15px;font-weight:600;color:var(--gray-800);margin-bottom:6px">${y.focus}</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">
                ${(y.actions || []).map(a => `<span style="padding:3px 10px;background:var(--gray-100);border-radius:99px;font-size:12px;color:var(--gray-600)">${a}</span>`).join('')}
              </div>
              <div style="font-size:13px;color:var(--gray-400)">→ ${y.outcome}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `);

    // Capability Gaps
    html.push(`
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon" style="background:#fef2f2">🔧</div>
          <div class="report-section-title">当前能力缺口分析</div>
        </div>
        <canvas id="gapChart" height="200"></canvas>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:20px">
          ${(data.capabilityGaps || []).map(g => `
            <div style="padding:16px;background:var(--gray-50);border-radius:var(--radius-lg)">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <span style="font-size:14px;font-weight:600;color:var(--gray-800)">${g.capability}</span>
                <span style="padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:${g.urgency === 'high' ? '#fef2f2' : '#fef9ee'};color:${g.urgency === 'high' ? 'var(--error)' : 'var(--warning)'};">${g.urgency === 'high' ? '紧急补强' : '建议提升'}</span>
              </div>
              <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
                <div style="flex:1">
                  <div style="font-size:11px;color:var(--gray-400);margin-bottom:3px">当前水平</div>
                  <div style="height:6px;background:var(--gray-200);border-radius:99px;overflow:hidden">
                    <div style="height:100%;width:${g.currentLevel}%;background:var(--gray-400);border-radius:99px"></div>
                  </div>
                </div>
                <div style="flex:1">
                  <div style="font-size:11px;color:var(--gray-400);margin-bottom:3px">目标水平</div>
                  <div style="height:6px;background:var(--gray-200);border-radius:99px;overflow:hidden">
                    <div style="height:100%;width:${g.requiredLevel}%;background:var(--navy-300);border-radius:99px"></div>
                  </div>
                </div>
              </div>
              <div style="font-size:13px;color:var(--gray-500)">${g.developmentPlan}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `);

    body.innerHTML = html.join('');
    setTimeout(() => {
      renderAbilityChart(data.interestAndAbility?.coreCompetencies);
      renderGapChart(data.capabilityGaps);
    }, 100);
  }

  // ---- Charts ----
  function renderRadarChart(dimensions) {
    const canvas = document.getElementById('radarChart');
    if (!canvas || !window.Chart) return;
    const labels = {
      academics: '学术基础',
      testScores: '语言/标化',
      majorFit: '专业匹配度',
      backgroundDepth: '背景完整度',
      highVisibility: '高辨识度成果',
      narrativeMaturity: '叙事成熟度',
      // legacy compat
      extracurriculars: '课外活动',
      leadership: '领导力',
      researchInnovation: '科研创新',
      applicationStrategy: '申请策略',
    };
    if (canvas._chart) canvas._chart.destroy();
    const chart = new Chart(canvas, {
      type: 'radar',
      data: {
        labels: Object.keys(dimensions||{}).map(k => labels[k] || k),
        datasets: [{
          label: '竞争力',
          data: Object.values(dimensions||{}),
          fill: true,
          backgroundColor: 'rgba(36,84,160,0.15)',
          borderColor: 'rgba(36,84,160,0.8)',
          pointBackgroundColor: '#2454a0',
          pointRadius: 4,
        }],
      },
      options: {
        scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: 'rgba(0,0,0,0.08)' }, pointLabels: { font: { size: 11 }, color: '#4a5270' } } },
        plugins: { legend: { display: false } },
      },
    });
    canvas._chart = chart;
  }

  function renderRiskChart(majorRisk) {
    const canvas = document.getElementById('riskChart');
    if (!canvas || !window.Chart) return;
    if (canvas._chart) canvas._chart.destroy();
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: (majorRisk || []).map(m => m.major),
        datasets: [{
          label: '申请风险指数',
          data: (majorRisk || []).map(m => m.riskScore || m.risk || 0),
          backgroundColor: (majorRisk || []).map(m => {
            const r = m.riskScore || m.risk || 0;
            return r >= 70 ? '#ef4444' : r >= 40 ? '#f59e0b' : '#22c55e';
          }),
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',
        scales: { x: { min: 0, max: 100, ticks: { font: { size: 11 } } }, y: { ticks: { font: { size: 11 } } } },
        plugins: { legend: { display: false } },
      },
    });
    canvas._chart = chart;
  }

  function renderFamilyGoalRadar(goalRadar) {
    const canvas = document.getElementById('familyGoalRadar');
    if (!canvas || !window.Chart || !goalRadar) return;
    const labels = { rankOriented: '名校导向', valueOriented: '性价比', stabilityOriented: '稳定性', globalOriented: '国际化', careerOriented: '就业导向', growthOriented: '长期成长' };
    if (canvas._chart) canvas._chart.destroy();
    const chart = new Chart(canvas, {
      type: 'radar',
      data: {
        labels: Object.keys(goalRadar).map(k => labels[k] || k),
        datasets: [{
          label: '家庭目标',
          data: Object.values(goalRadar),
          fill: true,
          backgroundColor: 'rgba(184,137,30,0.15)',
          borderColor: 'rgba(184,137,30,0.8)',
          pointBackgroundColor: '#b8891e',
          pointRadius: 4,
        }],
      },
      options: {
        scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: 'rgba(0,0,0,0.08)' }, pointLabels: { font: { size: 11 }, color: '#4a5270' } } },
        plugins: { legend: { display: false } },
      },
    });
    canvas._chart = chart;
  }

  function renderAlignmentRadar(alignRadar) {
    const canvas = document.getElementById('alignmentRadar');
    if (!canvas || !window.Chart || !alignRadar) return;
    const labels = { countryChoice: '国家选择', schoolTier: '学校层级', majorDirection: '专业方向', investmentExpect: '投入预期', riskPreference: '风险偏好' };
    if (canvas._chart) canvas._chart.destroy();
    const chart = new Chart(canvas, {
      type: 'radar',
      data: {
        labels: Object.keys(alignRadar).map(k => labels[k] || k),
        datasets: [{
          label: '一致度',
          data: Object.values(alignRadar),
          fill: true,
          backgroundColor: 'rgba(36,84,160,0.12)',
          borderColor: 'rgba(36,84,160,0.7)',
          pointBackgroundColor: '#2454a0',
          pointRadius: 4,
        }],
      },
      options: {
        scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: 'rgba(0,0,0,0.08)' }, pointLabels: { font: { size: 11 }, color: '#4a5270' } } },
        plugins: { legend: { display: false } },
      },
    });
    canvas._chart = chart;
  }

  function renderCountryChart(countries) {
    const canvas = document.getElementById('countryChart');
    if (!canvas || !window.Chart) return;
    if (canvas._chart) canvas._chart.destroy();
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: (countries || []).map(c => c.country),
        datasets: [
          { label: '性价比', data: (countries||[]).map(c => c.costScore ?? 0), backgroundColor: 'rgba(22,163,74,0.7)', borderRadius: 4 },
          { label: '门槛可达度', data: (countries||[]).map(c => c.thresholdScore ?? 0), backgroundColor: 'rgba(36,84,160,0.7)', borderRadius: 4 },
          { label: '家庭适配度', data: (countries||[]).map(c => c.familyFitScore ?? c.careerScore ?? 0), backgroundColor: 'rgba(184,137,30,0.7)', borderRadius: 4 },
        ],
      },
      options: {
        scales: { y: { min: 0, max: 100 }, x: { ticks: { font: { size: 11 } } } },
        plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
      },
    });
    canvas._chart = chart;
  }

  function renderResourceRadar(radarData) {
    const canvas = document.getElementById('resourceRadar');
    if (!canvas || !window.Chart || !radarData) return;
    const labels = { academicInvest: '学业投入', testInvest: '标化投入', backgroundInvest: '背景提升', globalProjectInvest: '国际项目', longTermPlanInvest: '长期规划' };
    if (canvas._chart) canvas._chart.destroy();
    const chart = new Chart(canvas, {
      type: 'radar',
      data: {
        labels: Object.keys(radarData).map(k => labels[k] || k),
        datasets: [{
          label: '投入优先级',
          data: Object.values(radarData),
          fill: true,
          backgroundColor: 'rgba(22,163,74,0.15)',
          borderColor: 'rgba(22,163,74,0.8)',
          pointBackgroundColor: '#16a34a',
          pointRadius: 4,
        }],
      },
      options: {
        scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: 'rgba(0,0,0,0.08)' }, pointLabels: { font: { size: 11 }, color: '#4a5270' } } },
        plugins: { legend: { display: false } },
      },
    });
    canvas._chart = chart;
  }

  function renderGrowthRadar(growthRadar) {
    const canvas = document.getElementById('growthRadarChart');
    if (!canvas || !window.Chart || !growthRadar) return;
    const labels = { academicPotential: '学术潜力', practiceOrientation: '实践导向', analyticalAbility: '分析能力', communication: '表达沟通', leadership: '领导力', globalMindset: '国际化' };
    if (canvas._chart) canvas._chart.destroy();
    const chart = new Chart(canvas, {
      type: 'radar',
      data: {
        labels: Object.keys(growthRadar).map(k => labels[k] || k),
        datasets: [{
          label: '成长画像',
          data: Object.values(growthRadar),
          fill: true,
          backgroundColor: 'rgba(22,163,74,0.15)',
          borderColor: 'rgba(22,163,74,0.8)',
          pointBackgroundColor: '#16a34a',
          pointRadius: 4,
        }],
      },
      options: {
        scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: 'rgba(0,0,0,0.08)' }, pointLabels: { font: { size: 11 }, color: '#4a5270' } } },
        plugins: { legend: { display: false } },
      },
    });
    canvas._chart = chart;
  }

  function renderAbilityTagChart(abilityTags) {
    const canvas = document.getElementById('abilityChart');
    if (!canvas || !window.Chart) return;
    const tags = (abilityTags || []).filter(t => t.weight !== undefined);
    if (!tags.length) return;
    if (canvas._chart) canvas._chart.destroy();
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: tags.map(t => t.tag),
        datasets: [{
          label: '能力权重',
          data: tags.map(t => t.weight),
          backgroundColor: tags.map(t =>
            t.type === 'strength' ? 'rgba(22,163,74,0.7)' :
            t.type === 'gap' ? 'rgba(239,68,68,0.6)' :
            'rgba(36,84,160,0.6)'
          ),
          borderRadius: 5,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',
        scales: { x: { min: 0, max: 100 }, y: { ticks: { font: { size: 11 } } } },
        plugins: { legend: { display: false } },
      },
    });
    canvas._chart = chart;
  }

  function renderAbilityChart(competencies) {
    // legacy compat — redirect to new radar
    renderGrowthRadar(null);
  }

  function renderGapChart(gaps) {
    const canvas = document.getElementById('gapChart');
    if (!canvas || !window.Chart) return;
    if (canvas._chart) canvas._chart.destroy();
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: (gaps || []).map(g => g.capability.length > 10 ? g.capability.substring(0, 10) + '…' : g.capability),
        datasets: [
          { label: '当前水平', data: (gaps||[]).map(g => g.currentLevel), backgroundColor: 'rgba(156,163,175,0.7)', borderRadius: 4 },
          { label: '目标水平', data: (gaps||[]).map(g => g.requiredLevel), backgroundColor: 'rgba(36,84,160,0.7)', borderRadius: 4 },
        ],
      },
      options: {
        scales: { y: { min: 0, max: 100 } },
        plugins: { legend: { position: 'top', labels: { font: { size: 11 } } } },
      },
    });
    canvas._chart = chart;
  }

  // ---- Account Page ----
  async function renderAccount(section = 'overview') {
    if (!APP.isLoggedIn()) {
      showModal('modalLogin');
      return;
    }
    const user = APP.state.user;
    document.getElementById('accountName').textContent = user.name;
    document.getElementById('accountEmail').textContent = user.email;
    document.getElementById('accountAvatarLetter').textContent = user.name.substring(0, 1);

    try {
      await APP.fetchAccountSummary();
    } catch (e) {
      toast(e.message || '账户数据加载失败', 'warning');
    }
    renderHistoryReports();
    renderVouchers();

    switchAccountSection(section);
  }

  function switchAccountSection(section) {
    document.querySelectorAll('.account-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.account-nav-item').forEach(i => i.classList.remove('active'));
    const sectionEl = document.getElementById('accountSection-' + section);
    const navEl = document.querySelector(`[data-account-section="${section}"]`);
    if (sectionEl) sectionEl.classList.add('active');
    if (navEl) navEl.classList.add('active');
  }

  function renderHistoryReports() {
    const container = document.getElementById('historyReportsList');
    const reports = APP.state.reports;
    if (!reports.length) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400)">暂无报告，去填写问卷生成您的第一份报告吧</div>';
      return;
    }
    container.innerHTML = reports.map(r => `
      <div class="history-report-card" onclick="UI.viewReport('${r.id}')">
        <div class="history-report-icon" style="background:${r.typeInfo?.color}20">
          ${r.typeInfo?.emoji || '📊'}
        </div>
        <div class="history-report-info">
          <div class="history-report-title">${r.typeInfo?.name || '报告'}</div>
          <div class="history-report-meta">
            <span>${new Date(r.createdAt).toLocaleDateString('zh-CN')}</span>
            <span>·</span>
            <span>${r.typeInfo?.engine || ''}</span>
          </div>
        </div>
        <div class="history-report-status status-done">已完成</div>
      </div>
    `).join('');
  }

  function renderVouchers() {
    const container = document.getElementById('vouchersList');
    const subscriptionEl = document.getElementById('subscriptionStatus');
    if (subscriptionEl) {
      const sub = APP.state.subscription;
      subscriptionEl.innerHTML = sub
        ? `<div style="padding:14px 16px;background:var(--success-light);border-radius:var(--radius-xl);font-size:14px;color:var(--success);font-weight:600">当前会员有效期至：${new Date(sub.endTime || sub.end_time).toLocaleDateString('zh-CN')} · 本月不限次数生成报告</div>`
        : `<div style="padding:14px 16px;background:var(--gray-50);border-radius:var(--radius-xl);font-size:13px;color:var(--gray-500)">当前暂无有效会员，可使用报告权益券或兑换会员码。</div>`;
    }
    const vouchers = APP.state.vouchers;
    if (!vouchers.length) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400)">暂无可用权益，请输入兑换码或通过荔智惠购买权益。</div>';
      return;
    }
    container.innerHTML = vouchers.map(v => {
      const exp = v.expiresAt ? new Date(v.expiresAt).toLocaleDateString('zh-CN') : '长期有效';
      const isExpired = v.expiresAt ? new Date(v.expiresAt) < new Date() : false;
      const sourceLabel = v.source === 'lizhihui' ? '荔智惠权益' : v.source === 'redemption_code' ? '兑换码权益' : '平台权益';
      const sourceMeta = v.partnerOrderId ? ` · 订单 ${v.partnerOrderId}` : '';
      return `
        <div class="voucher-card" style="margin-bottom:16px;${isExpired ? 'opacity:0.5' : ''}">
          <div class="voucher-amount">
            <div class="voucher-amount-num">${v.remainingQuantity ?? v.amount ?? 1}</div>
            <div class="voucher-amount-label">次权益</div>
          </div>
          <div class="voucher-divider"></div>
          <div class="voucher-info">
            <div class="voucher-title">${v.service || '全球留学战略咨询'}</div>
            <div class="voucher-desc">${sourceLabel}${sourceMeta}</div>
            <div class="voucher-code">权益码 ${v.code}</div>
            <div class="voucher-expiry">有效期至：${exp}${isExpired ? ' · 已过期' : ''}</div>
          </div>
          ${!isExpired ? `<button class="btn btn-gold btn-sm" onclick="UI.showModal('modalSelectReport')">去生成报告</button>` : ''}
        </div>
      `;
    }).join('');
  }

  async function redeemCode() {
    const input = document.getElementById('redeemCodeInput');
    const code = input?.value.trim();
    if (!code) {
      toast('请输入兑换码', 'warning');
      return;
    }
    try {
      await APP.redeemCode(code);
      input.value = '';
      toast('兑换成功，权益已到账', 'success');
      renderVouchers();
    } catch (e) {
      toast(e.message || '兑换失败，请检查兑换码', 'error');
    }
  }

  function openEntitlementRequiredModal(message) {
    const messageEl = document.getElementById('entitlementRequiredMessage');
    const input = document.getElementById('entitlementRedeemCode');
    if (messageEl) messageEl.textContent = message || '当前账户没有可用报告权益或有效会员。';
    if (input) input.value = '';
    showModal('modalEntitlementRequired');
  }

  async function redeemCodeAndRetryReport() {
    const input = document.getElementById('entitlementRedeemCode');
    const code = input?.value.trim();
    if (!code) {
      toast('请输入兑换码', 'warning');
      return;
    }
    try {
      await APP.redeemCode(code);
      toast('兑换成功，正在继续生成报告', 'success');
      hideModal('modalEntitlementRequired');
      if (generatingParams) {
        showPage('generating', generatingParams);
      } else {
        showPage('account', { section: 'vouchers' });
      }
    } catch (e) {
      toast(e.message || '兑换失败，请检查兑换码', 'error');
    }
  }

  function goBuyEntitlement() {
    hideModal('modalEntitlementRequired');
    goToMiniProgram();
  }

  function viewReport(reportId) {
    showPage('report', { reportId });
  }

  function goToMiniProgram() {
    // 荔智惠小程序跳转逻辑
    toast('正在跳转到荔智惠小程序…', 'info');
    setTimeout(() => {
      // 实际小程序跳转会通过微信 JSSDK 或 schema 实现
      // 这里弹出说明
      document.getElementById('modalMiniProgram').classList.add('active');
    }, 800);
  }

  function claimLizhihuiVoucher(productId) {
    const result = APP.claimLizhihuiVoucher(productId);
    if (!result.ok) {
      toast(result.msg, 'warning');
      showModal('modalRegister');
      return;
    }
    toast(result.msg, 'success');
    renderVouchers();
    setTimeout(() => showPage('account', { section: 'vouchers' }), 500);
  }

  // ---- Score Label ----
  function getScoreLabel(score) {
    if (score >= 85) return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:var(--success-light);border-radius:99px;font-size:13px;font-weight:600;color:var(--success)">🌟 极具竞争力</span>`;
    if (score >= 70) return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:var(--navy-50);border-radius:99px;font-size:13px;font-weight:600;color:var(--navy-500)">✦ 竞争力良好</span>`;
    if (score >= 55) return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:var(--warning-light);border-radius:99px;font-size:13px;font-weight:600;color:var(--warning)">△ 需重点补强</span>`;
    return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:#fef2f2;border-radius:99px;font-size:13px;font-weight:600;color:var(--error)">⚠ 竞争力待提升</span>`;
  }

  // ---- Voucher Center page rendering ----
  function renderVoucherPage() {
    const container = document.getElementById('voucherPageList');
    if (!container) return;
    renderVouchers();
  }

  // ---- Authority Tabs ----
  function switchAuthorityTab(idx) {
    document.querySelectorAll('.authority-tab').forEach((t, i) => {
      t.classList.toggle('active', i === idx);
    });
    document.querySelectorAll('.authority-panel').forEach((p, i) => {
      p.classList.toggle('active', i === idx);
    });
  }

  // ---- Public ----
  return {
    toast,
    showPage,
    updateNav,
    showModal,
    hideModal,
    handleRegister,
    handleLogin,
    sendRegisterCode,
    sendLoginCode,
    renderQuestionnaire,
    qNext,
    qPrev,
    renderAccount,
    switchAccountSection,
    renderHistoryReports,
    renderVouchers,
    redeemCode,
    redeemCodeAndRetryReport,
    goBuyEntitlement,
    viewReport,
    goToMiniProgram,
    claimLizhihuiVoucher,
    switchAuthorityTab,
  };
})();

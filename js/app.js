/**
 * Global Pathway Navigator
 * Core Application State & Mock Data Layer
 */

const APP = (() => {
  const memoryStore = new Map();

  // ---- Config ----
  const CONFIG = {
    // 正式上线时前端只调用自己的后端，通义千问 API Key 必须放在后端。
    BACKEND_API_BASE: window.GPN_CONFIG?.BACKEND_API_BASE || '',
    MODEL: 'qwen-plus',
    USE_MOCK: window.GPN_CONFIG?.USE_MOCK ?? true,
  };

  // ---- State ----
  const state = {
    currentPage: 'home',
    user: null,
    questionnaire: {
      reportType: null,
      currentStep: 0,
      data: {},
    },
    reports: [],
    vouchers: [],
    authToken: null,
  };

  function backendEnabled() {
    return !!CONFIG.BACKEND_API_BASE || CONFIG.USE_MOCK === false;
  }

  function apiUrl(path) {
    return `${CONFIG.BACKEND_API_BASE || ''}${path}`;
  }

  // ---- LocalStorage helpers ----
  function saveState() {
    try {
      localStorage.setItem('gpn_user', JSON.stringify(state.user));
      localStorage.setItem('gpn_reports', JSON.stringify(state.reports));
      localStorage.setItem('gpn_vouchers', JSON.stringify(state.vouchers));
      localStorage.setItem('gpn_auth_token', state.authToken || '');
    } catch(e) {
      memoryStore.set('gpn_user', JSON.stringify(state.user));
      memoryStore.set('gpn_reports', JSON.stringify(state.reports));
      memoryStore.set('gpn_vouchers', JSON.stringify(state.vouchers));
      memoryStore.set('gpn_auth_token', state.authToken || '');
    }
  }

  function loadState() {
    try {
      const u = localStorage.getItem('gpn_user');
      const r = localStorage.getItem('gpn_reports');
      const v = localStorage.getItem('gpn_vouchers');
      const t = localStorage.getItem('gpn_auth_token');
      if (u) state.user = JSON.parse(u);
      if (r) state.reports = JSON.parse(r);
      if (v) state.vouchers = JSON.parse(v);
      if (t) state.authToken = t;
    } catch(e) {
      const u = memoryStore.get('gpn_user');
      const r = memoryStore.get('gpn_reports');
      const v = memoryStore.get('gpn_vouchers');
      const t = memoryStore.get('gpn_auth_token');
      if (u) state.user = JSON.parse(u);
      if (r) state.reports = JSON.parse(r);
      if (v) state.vouchers = JSON.parse(v);
      if (t) state.authToken = t;
    }
  }

  // ---- Mock accounts (pre-seeded) ----
  function getUsers() {
    try {
      const stored = localStorage.getItem('gpn_users');
      if (stored) return JSON.parse(stored);
    } catch(e) {
      const stored = memoryStore.get('gpn_users');
      if (stored) return JSON.parse(stored);
    }
    return [];
  }
  function saveUsers(users) {
    const payload = JSON.stringify(users);
    try {
      localStorage.setItem('gpn_users', payload);
    } catch(e) {
      memoryStore.set('gpn_users', payload);
    }
  }

  // ---- Auth ----
  async function sendVerificationCode(phone, purpose) {
    if (!backendEnabled()) {
      return { success: true, mockCode: '123456' };
    }
    return apiRequest('/api/v1/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({ phone, purpose }),
    });
  }

  async function register(name, email, password, phone, verificationCode) {
    if (backendEnabled()) {
      try {
        const response = await fetch(apiUrl('/api/v1/auth/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, phone, verificationCode }),
        });
        const result = await response.json();
        if (!response.ok) return { ok: false, msg: result.error || '注册失败，请稍后重试' };
        state.user = result.user;
        state.authToken = result.token;
        saveState();
        return { ok: true };
      } catch(e) {
        return { ok: false, msg: '后端服务暂时无法连接，请稍后重试' };
      }
    }

    const users = getUsers();
    if (users.find(u => u.email === email)) {
      return { ok: false, msg: '该邮箱已注册，请直接登录' };
    }
    const user = {
      id: 'u_' + Date.now(),
      name, email, password, phone,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);
    state.user = { ...user };
    delete state.user.password;
    saveState();
    return { ok: true };
  }

  async function apiRequest(path, options = {}) {
    if (!backendEnabled()) throw new Error('Backend API is not configured');
    const response = await fetch(apiUrl(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `API error ${response.status}`);
    return data;
  }

  async function login(login, password, verificationCode) {
    if (backendEnabled()) {
      try {
        const response = await fetch(apiUrl('/api/v1/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(verificationCode
            ? { phone: login, verificationCode }
            : { email: login, password }),
        });
        const result = await response.json();
        if (!response.ok) return { ok: false, msg: result.error || '登录失败，请稍后重试' };
        state.user = result.user;
        state.authToken = result.token;
        saveState();
        return { ok: true };
      } catch(e) {
        return { ok: false, msg: '后端服务暂时无法连接，请稍后重试' };
      }
    }

    const users = getUsers();
    const user = users.find(u => (u.email === login || u.phone === login) && (verificationCode || u.password === password));
    if (!user) return { ok: false, msg: '邮箱或密码错误，请重试' };
    state.user = { ...user };
    delete state.user.password;
    saveState();
    return { ok: true };
  }

  function logout() {
    state.user = null;
    state.authToken = null;
    saveState();
  }

  function isLoggedIn() {
    return !!state.user;
  }

  async function fetchAccountSummary() {
    if (!backendEnabled() || !state.authToken) {
      return {
        reports: state.reports,
        entitlements: state.vouchers,
        subscription: null,
      };
    }
    const data = await apiRequest('/api/v1/account/summary');
    state.reports = (data.reports || []).map(r => ({
      id: r.id,
      type: r.report_type || r.reportType,
      typeInfo: REPORT_TYPES[r.report_type || r.reportType] || REPORT_TYPES.competitiveness,
      createdAt: r.created_at || r.createdAt,
      reportData: null,
      status: r.status,
    }));
    state.vouchers = (data.entitlements || []).map(e => ({
      id: e.id,
      code: e.external_order_id || e.id,
      amount: e.remaining_quantity || 0,
      status: e.status,
      source: e.source,
      service: e.entitlement_type === 'report_once' ? '任意 AI 报告生成权益' : e.entitlement_type,
      expiresAt: e.expires_at || e.expiresAt,
      remainingQuantity: e.remaining_quantity,
    }));
    state.subscription = data.subscription || null;
    saveState();
    return data;
  }

  async function redeemCode(code) {
    const data = await apiRequest('/api/v1/redemptions/redeem', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    await fetchAccountSummary();
    return data;
  }

  async function fetchReport(reportId) {
    if (!backendEnabled() || !state.authToken) {
      return state.reports.find(r => r.id === reportId);
    }
    const data = await apiRequest(`/api/v1/reports/${reportId}`);
    const r = data.report;
    const report = {
      id: r.id,
      type: r.reportType,
      typeInfo: REPORT_TYPES[r.reportType] || REPORT_TYPES.competitiveness,
      createdAt: r.createdAt,
      questionnaireData: {},
      reportData: r.reportData || r.fullContentJson || {},
      status: r.status,
    };
    const idx = state.reports.findIndex(item => item.id === reportId);
    if (idx >= 0) state.reports[idx] = report;
    else state.reports.unshift(report);
    saveState();
    return report;
  }

  // ---- Lizhihui Voucher Integration Demo ----
  const LIZHIHUI_PRODUCTS = [
    {
      id: 'lzh_ai_report_trial',
      name: 'AI 报告免费体验券',
      amount: 100,
      service: 'AI 升学报告体验权益',
      desc: '用户在荔智惠小程序领取后，可在本平台兑换一次 AI 报告体验权益。',
    },
    {
      id: 'lzh_strategy_session',
      name: '全球留学战略咨询抵扣券',
      amount: 150,
      service: 'Global Study Abroad Strategy Session｜全球留学战略咨询',
      desc: '用户完成报告后，可在荔智惠小程序预约咨询时抵扣使用。',
    },
  ];

  function claimLizhihuiVoucher(productId = 'lzh_ai_report_trial') {
    if (!state.user) {
      return { ok: false, msg: '请先登录或注册账户，再模拟领取荔智惠权益券' };
    }
    const product = LIZHIHUI_PRODUCTS.find(p => p.id === productId) || LIZHIHUI_PRODUCTS[0];
    const orderId = 'LZH-' + Date.now();
    const existing = state.vouchers.find(v => v.partnerOrderId === orderId);
    if (existing) return { ok: true, voucher: existing, msg: '该权益券已领取' };

    const voucher = {
      id: 'v_lzh_' + Date.now(),
      code: 'LZH-GPN-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      amount: product.amount,
      reportId: null,
      reportType: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      service: product.service,
      source: 'lizhihui',
      sourceName: '荔智惠小程序',
      partnerUserId: 'lzh_demo_' + state.user.id,
      partnerProductId: product.id,
      partnerOrderId: orderId,
      claimChannel: 'api_demo',
    };
    state.vouchers.unshift(voucher);
    saveState();
    return { ok: true, voucher, msg: '荔智惠权益券已发放到当前账户' };
  }

  // ---- Report Type Definitions ----
  const REPORT_TYPES = {
    competitiveness: {
      id: 'competitiveness',
      name: '全球留学竞争力评估报告',
      nameEn: 'Global Study Competitiveness Assessment',
      emoji: '🌐',
      color: '#2454a0',
      badgeClass: 'badge-blue',
      engine: 'AI Applicant Competitiveness Intelligence Engine',
      question: '我的孩子能申请到什么层级的大学？背景有哪些短板需要补强？',
      desc: '基于 22,000+ 真实申请案例，结合藤校招生官视角，精准评估申请竞争力，生成个性化院校推荐与补强方案。',
      stats: [
        { value: '22,000+', label: '真实申请案例' },
        { value: '500+', label: '合作留学机构' },
        { value: '95%', label: 'Top30 录取率' },
        { value: '藤校', label: '导师视角分析' },
      ],
      voucherAmount: 100,
    },
    family: {
      id: 'family',
      name: 'NextGen 家族教育战略智能报告',
      nameEn: 'NextGen Family Education Strategy Report',
      emoji: '🏛️',
      color: '#b8891e',
      badgeClass: 'badge-gold',
      engine: 'AI Family Education Decision Intelligence System',
      question: '我的家庭应该选择哪条国际教育路径？钱和时间应该怎么投入？',
      desc: '整合 10,000+ 家庭全周期档案，系统分析目标国家路径对比、成本收益与资源配置，帮助家庭做出最优教育决策。',
      stats: [
        { value: '800+', label: '国际化学校项目' },
        { value: '10,000+', label: '家庭沟通档案' },
        { value: '200+', label: '海外本科院校' },
        { value: '500+', label: '服务机构案例库' },
      ],
      voucherAmount: 150,
    },
    career: {
      id: 'career',
      name: 'Life-Career Strategy 人生生涯全规划报告',
      nameEn: 'Life-Career Strategy Report',
      emoji: '🚀',
      color: '#15803d',
      badgeClass: 'badge-green',
      engine: 'AI Life-Career Trajectory Simulation Engine',
      question: '我的孩子适合什么职业方向？现在应该怎么规划未来 5 年的路径？',
      desc: '融合 200+ 顶企招聘数据与 Future of Jobs 趋势报告，生成职业路径树与人生发展时间轴，让每一步成长都与未来目标相连。',
      stats: [
        { value: '200+', label: '顶企招聘数据' },
        { value: 'QS', label: '就业能力指标' },
        { value: 'WEF', label: 'Future of Jobs' },
        { value: 'Times', label: '就业力排名' },
      ],
      voucherAmount: 120,
    },
  };

  // ---- Questionnaire Steps (per reportType) ----
  // 每类报告独立的问卷步骤配置
  const QUESTIONNAIRE_STEPS_MAP = {

    // ===========================================================
    // 报告一：全球留学竞争力评估（正式重构版，7 模块 42 题）
    // ===========================================================
    competitiveness: [
      // ---- 模块 A：申请目标与当前学校情况 ----
      {
        id: 'c_module_a',
        title: '模块 A：申请目标与当前学校情况',
        desc: '请填写你当前所处的教育阶段与申请目标，系统将以此建立初始申请档案。',
        insight: '申请目标与学校背景是评估竞争力基准线的核心起点。',
        fields: [
          {
            id: 'applyGoal',
            label: '你当前最主要的申请目标是？',
            type: 'radio',
            required: true,
            options: ['高中申请海外本科', '本科申请海外硕士', '暂时还没完全确定，先做评估'],
          },
          {
            id: 'schoolName',
            label: '你目前所在学校名称是？',
            type: 'text',
            placeholder: '请填写学校全称，例如：上海外国语大学附属外国语学校',
          },
          // 若为"高中申请海外本科"
          {
            id: 'schoolTypeHS',
            label: '你目前所在学校更接近哪一类？',
            type: 'radio',
            required: true,
            showIf: { field: 'applyGoal', value: '高中申请海外本科' },
            options: ['国内公立高中', '国际学校 / 国际课程学校', '海外高中', '其他'],
          },
          // 若为"本科申请海外硕士"
          {
            id: 'schoolTypeUG',
            label: '你目前所在学校更接近哪一类？',
            type: 'radio',
            required: true,
            showIf: { field: 'applyGoal', value: '本科申请海外硕士' },
            options: ['国内本科院校', '海外本科院校', '中外合作办学本科', '其他'],
          },
          // 若为"高中申请海外本科"
          {
            id: 'gradeHS',
            label: '你当前所在阶段是？',
            type: 'radio',
            required: true,
            showIf: { field: 'applyGoal', value: '高中申请海外本科' },
            options: ['9–10 年级 / 高一高二', '11 年级', '12 年级 / 申请阶段', '已毕业 / Gap 中'],
          },
          // 若为"本科申请海外硕士"
          {
            id: 'gradeUG',
            label: '你当前所在阶段是？',
            type: 'radio',
            required: true,
            showIf: { field: 'applyGoal', value: '本科申请海外硕士' },
            options: ['大一 / 大二', '大三', '大四 / 应届申请', '已毕业 / Gap 中'],
          },
          {
            id: 'enrollTime',
            label: '你计划申请的入学时间更接近哪一项？',
            type: 'radio',
            required: true,
            options: ['1 年内', '1–2 年内', '2 年以上', '还没确定'],
          },
        ],
      },

      // ---- 模块 B：学术表现 ----
      {
        id: 'c_module_b',
        title: '模块 B：学术表现',
        desc: '请如实填写当前成绩情况，系统将基于真实数据进行精准竞争力评估。',
        insight: '学术维度是评估冲刺层级的核心变量，请尽量提供最准确的数据。',
        fields: [
          {
            id: 'gpaScore',
            label: '你目前的 GPA / 平均成绩是多少？',
            type: 'text',
            placeholder: '支持 GPA 或百分制均分，例如 3.7/4.0、87/100',
          },
          {
            id: 'rankLevel',
            label: '你目前的排名情况更接近哪一项？',
            type: 'radio',
            required: true,
            options: ['前 10%', '前 30%', '30% 之后', '学校不提供排名 / 不清楚'],
          },
          // 若为"高中申请海外本科"
          {
            id: 'curriculumHS',
            label: '你当前的课程体系是？',
            type: 'radio',
            required: true,
            showIf: { field: 'applyGoal', value: '高中申请海外本科' },
            options: ['国内普通高中课程', 'AP / A-Level / IB 等国际课程', '其他课程体系'],
          },
          // 若为"本科申请海外硕士"
          {
            id: 'curriculumUG',
            label: '你当前的课程体系是？',
            type: 'radio',
            required: true,
            showIf: { field: 'applyGoal', value: '本科申请海外硕士' },
            options: ['国内本科课程体系', '海外本科课程体系', '其他课程体系'],
          },
          {
            id: 'academicState',
            label: '你目前的学业状态更接近哪一种？',
            type: 'radio',
            required: true,
            options: ['整体稳定，成绩表现较强', '有一定优势，但也有明显短板', '成绩中等，波动较大', '成绩目前不太理想'],
          },
          {
            id: 'strongSubjects',
            label: '你目前最有把握的学科方向有哪些？（最多选 3）',
            type: 'checkbox',
            maxSelect: 3,
            options: ['数学 / 定量分析', '理工科', '计算机 / 编程', '商科 / 经济', '人文社科', '语言表达 / 写作', '艺术 / 设计', '暂不明确'],
          },
        ],
      },

      // ---- 模块 C：语言与标化 ----
      {
        id: 'c_module_c',
        title: '模块 C：语言与标化',
        desc: '请填写当前语言及标化成绩情况，系统将评估其与目标院校要求的匹配程度。',
        insight: '语言与标化是申请的硬性门槛，将直接影响院校层级判断。',
        fields: [
          {
            id: 'hasLangScore',
            label: '你目前是否已有语言成绩？',
            type: 'radio',
            required: true,
            options: ['有', '没有', '正在准备'],
          },
          {
            id: 'langScore',
            label: '你的语言成绩是多少？',
            type: 'text',
            placeholder: '如托福 105、雅思 7.5、Duolingo 135；若暂无可填"无"',
          },
          // 若为"高中申请海外本科"
          {
            id: 'hasStdScoreHS',
            label: '你目前是否已有标化成绩？',
            type: 'radio',
            required: true,
            showIf: { field: 'applyGoal', value: '高中申请海外本科' },
            options: ['有 SAT / ACT', '暂无，但计划准备', '暂无，且暂未确定是否需要'],
          },
          // 若为"本科申请海外硕士"
          {
            id: 'hasStdScoreUG',
            label: '你目前是否已有标化成绩？',
            type: 'radio',
            required: true,
            showIf: { field: 'applyGoal', value: '本科申请海外硕士' },
            options: ['有 GRE / GMAT', '暂无，但计划准备', '暂无，且暂未确定是否需要'],
          },
          {
            id: 'stdScore',
            label: '你的标化成绩是多少？',
            type: 'text',
            placeholder: '如 SAT 1480、GRE 325、GMAT 710；若暂无可填"无"',
          },
          {
            id: 'testReadiness',
            label: '你目前在语言或标化准备上更接近哪种状态？',
            type: 'radio',
            required: true,
            options: ['已经比较接近目标', '有一定基础，但还有明显提升空间', '刚开始准备或尚未系统开始'],
          },
        ],
      },

      // ---- 模块 D：专业方向与国家偏好 ----
      {
        id: 'c_module_d',
        title: '模块 D：专业方向与国家偏好',
        desc: '专业方向与目标国家是构建申请叙事的核心，请尽量真实表达目前的想法。',
        insight: '专业匹配度与国家偏好将直接影响院校推荐的方向性与精准度。',
        fields: [
          {
            id: 'targetMajors',
            label: '你当前最感兴趣的专业方向有哪些？（最多选 4）',
            type: 'checkbox',
            maxSelect: 4,
            options: [
              '金融 / 会计 / 商业分析',
              '经济 / 数学 / 计量',
              '计算机 / AI / 数据科学',
              '工程 / 机械 / 电子 / 材料',
              '生物 / 医学 / 公共卫生',
              '心理学 / 教育',
              '社会科学 / 公共政策 / 国际关系',
              '传媒 / 新闻 / 人文',
              '法律',
              '设计 / 艺术',
              '暂不确定',
            ],
          },
          {
            id: 'majorClarity',
            label: '你目前对专业方向的状态更接近哪一项？',
            type: 'radio',
            required: true,
            options: ['已经非常明确', '有 1–2 个重点方向，仍在比较', '目前还比较模糊'],
          },
          {
            id: 'targetCountries',
            label: '你当前最想申请的国家/地区有哪些？（最多选 4）',
            type: 'checkbox',
            maxSelect: 4,
            options: ['美国', '英国', '香港', '新加坡', '加拿大', '澳大利亚', '欧洲', '其他地区', '暂不确定'],
          },
          {
            id: 'countryReasons',
            label: '你选择这些国家/地区更主要是因为哪些原因？（最多选 3）',
            type: 'checkbox',
            maxSelect: 3,
            options: [
              '学校整体实力',
              '专业资源更强',
              '就业与职业发展机会',
              '预算和性价比',
              '环境与生活方式',
              '家庭偏好或已有资源',
              '还没有系统判断，更多是直觉偏好',
            ],
          },
          {
            id: 'tierExpectation',
            label: '你当前对学校层级的期待更接近哪种情况？',
            type: 'radio',
            required: true,
            options: [
              '尽可能冲击更高层级学校',
              '在较高层级里争取更稳妥结果',
              '更看重结果稳定和性价比',
              '希望系统帮我判断更适合的层级',
            ],
          },
        ],
      },

      // ---- 模块 E：背景经历 ----
      {
        id: 'c_module_e',
        title: '模块 E：背景经历',
        desc: '课外经历是申请差异化的核心，请重点描述成果而非只写名称。',
        insight: '经历的深度与成果质量，是判断高辨识度背景的关键维度。',
        fields: [
          {
            id: 'expTypes',
            label: '你目前已经有过哪些类型的经历？（最多选 6）',
            type: 'checkbox',
            maxSelect: 6,
            options: [
              '学术竞赛',
              '科研 / 研究项目',
              '实习 / 工作实践',
              '社团 / 学生组织',
              '志愿活动 / 公益经历',
              '创业 / 项目实践',
              '国际项目 / 夏校 / 交换',
              '作品集 / 公开成果',
              '暂无特别突出的经历',
            ],
          },
          // 条件显现：填写竞赛经历
          {
            id: 'expCompetition',
            label: '学术竞赛经历',
            type: 'textarea',
            placeholder: '请填写你最有代表性的 1–2 项学术竞赛经历（竞赛名称、级别、成绩）',
            showIf: { field: 'expTypes', includes: '学术竞赛' },
          },
          // 条件显现：填写科研经历
          {
            id: 'expResearch',
            label: '科研 / 研究项目经历',
            type: 'textarea',
            placeholder: '请填写你最有代表性的 1–2 项科研或研究经历（项目名称、参与方式、成果）',
            showIf: { field: 'expTypes', includes: '科研 / 研究项目' },
          },
          // 条件显现：填写实习经历
          {
            id: 'expInternship',
            label: '实习 / 工作实践经历',
            type: 'textarea',
            placeholder: '请填写你最有代表性的 1–2 项实习或实践经历（公司/机构、岗位、时长）',
            showIf: { field: 'expTypes', includes: '实习 / 工作实践' },
          },
          // 条件显现：填写社团经历
          {
            id: 'expClub',
            label: '社团 / 学生组织经历',
            type: 'textarea',
            placeholder: '请填写你最有代表性的 1–2 项组织或活动经历（名称、角色、成果）',
            showIf: { field: 'expTypes', includes: '社团 / 学生组织' },
          },
          // 条件显现：填写志愿经历
          {
            id: 'expVolunteer',
            label: '志愿活动 / 公益经历',
            type: 'textarea',
            placeholder: '请填写你最有代表性的 1–2 项相关经历（项目名称、时长、参与方式）',
            showIf: { field: 'expTypes', includes: '志愿活动 / 公益经历' },
          },
          // 条件显现：填写创业经历
          {
            id: 'expEntrepreneur',
            label: '创业 / 项目实践经历',
            type: 'textarea',
            placeholder: '请填写你最有代表性的 1–2 项项目经历（项目名称、角色、结果）',
            showIf: { field: 'expTypes', includes: '创业 / 项目实践' },
          },
          // 条件显现：填写国际经历
          {
            id: 'expInternational',
            label: '国际项目 / 夏校 / 交换经历',
            type: 'textarea',
            placeholder: '请填写你最有代表性的 1–2 项国际化经历（项目名称、机构、时长）',
            showIf: { field: 'expTypes', includes: '国际项目 / 夏校 / 交换' },
          },
          // 条件显现：填写作品集
          {
            id: 'expPortfolio',
            label: '作品集 / 公开成果',
            type: 'textarea',
            placeholder: '请填写你最有代表性的 1–2 项成果（作品名称、类型、发表/展示情况）',
            showIf: { field: 'expTypes', includes: '作品集 / 公开成果' },
          },
          {
            id: 'expOverallState',
            label: '你目前这些经历的整体状态更接近哪一项？',
            type: 'radio',
            required: true,
            options: [
              '已经形成比较清晰的主线',
              '有一些不错的经历，但整体还比较分散',
              '有少量经历，但还不够形成竞争力',
              '整体上还比较空白',
            ],
          },
          {
            id: 'expInvestStyle',
            label: '你目前在课外经历上的投入方式更接近哪一项？',
            type: 'radio',
            required: true,
            options: [
              '长期在一个方向持续积累',
              '同时尝试多个方向，希望全面一些',
              '以学校安排或常规参与为主',
              '还没有形成系统投入',
            ],
          },
        ],
      },

      // ---- 模块 F：学习方式、环境偏好与发展路径倾向 ----
      {
        id: 'c_module_f',
        title: '模块 F：学习方式与发展路径倾向',
        desc: '以下问题帮助系统深入理解你的学习偏好与发展倾向，请选择最接近自己真实状态的答案。',
        insight: '这一模块用于系统推理，将与前面的客观数据结合，形成更完整的个人画像。',
        fields: [
          {
            id: 'preferEnv',
            label: '如果未来进入一个新的学习环境，你更希望它接近哪种状态？',
            type: 'radio',
            required: true,
            options: [
              '竞争激烈、节奏快、身边同学都很强',
              '资源丰富、国际化、多元机会多',
              '更安静、适合深入学习和钻研',
              '目前很难判断',
            ],
          },
          {
            id: 'learningStyle',
            label: '你更习惯哪种学习方式？',
            type: 'radio',
            required: true,
            options: [
              '通过阅读、理论和系统框架理解问题',
              '通过项目、实验和实践来理解问题',
              '两种方式都需要，缺一不可',
            ],
          },
          {
            id: 'studyOrientation',
            label: '如果未来进入大学或研究生阶段，你更希望自己的学习状态更接近哪一项？',
            type: 'radio',
            required: true,
            options: ['更偏学术和研究导向', '更偏应用和实践导向', '希望两者兼顾', '目前还不清楚'],
          },
          {
            id: 'postGradPlan',
            label: '你对毕业后的打算更接近哪一项？',
            type: 'radio',
            required: true,
            options: ['尽快进入工作岗位', '先工作，再考虑继续深造', '本身就有继续深造的计划', '目前还不确定'],
          },
          {
            id: 'cityPreference',
            label: '如果未来长期在一个城市学习和生活，你更偏向哪种环境？',
            type: 'radio',
            required: true,
            options: [
              '文化多样性强、机会多的大城市',
              '节奏平衡、资源不错的城市',
              '安静、学术氛围浓的中小城市',
              '暂时没有明显偏好',
            ],
          },
          {
            id: 'newFieldReaction',
            label: '面对一个全新的领域，你通常更接近哪种反应？',
            type: 'radio',
            required: true,
            options: [
              '先大量了解信息，再决定要不要深入',
              '先试着做一点，在实践中判断',
              '先和别人交流，看看适不适合自己',
              '看具体情况，没有固定方式',
            ],
          },
          {
            id: 'sustainedInterest',
            label: '哪类事情更容易让你持续投入？',
            type: 'radio',
            required: true,
            options: [
              '复杂问题和逻辑推理',
              '能看见结果的实际项目',
              '与人沟通、表达和合作',
              '新想法、新内容和创造性表达',
              '还在探索中',
            ],
          },
        ],
      },

      // ---- 模块 G：申请风险与报告目标 ----
      {
        id: 'c_module_g',
        title: '模块 G：申请风险与报告目标',
        desc: '请告诉系统你当前最担心的申请问题，以及最希望从这份报告中获得哪些判断。',
        insight: '明确你的核心诉求，将帮助系统生成更具针对性的评估与建议。',
        fields: [
          {
            id: 'mainWorries',
            label: '你当前最担心的申请问题是什么？（最多选 2）',
            type: 'checkbox',
            maxSelect: 2,
            options: [
              '申请不到理想学校',
              '目标专业风险太高',
              '背景竞争力不够',
              '不知道该优先补什么',
              '不知道该如何选国家/学校',
              '准备节奏偏晚',
              '担心投入很多但结果一般',
            ],
          },
          {
            id: 'prepState',
            label: '你目前的准备状态更接近哪一项？',
            type: 'radio',
            required: true,
            options: ['已经在系统准备', '有一些准备，但不成体系', '还没正式开始', '只是先了解一下'],
          },
          {
            id: 'familyExpectation',
            label: '家庭对结果的期待更接近哪一项？',
            type: 'radio',
            required: true,
            options: [
              '尽可能冲击更高层级学校',
              '在较高层级中争取更稳妥结果',
              '结果稳定更重要',
              '希望系统判断更适合的策略',
            ],
          },
          {
            id: 'reportFocus',
            label: '你最希望这份报告重点告诉你的是什么？（最多选 2）',
            type: 'checkbox',
            maxSelect: 2,
            options: [
              '我能冲刺到哪些学校',
              '我更匹配哪些学校',
              '我的关键短板是什么',
              '我应该优先补什么',
              '我的目标专业风险高不高',
              '除了我现在偏好的国家外，还有哪些地方适合我',
            ],
          },
        ],
      },
    ],

    // ===========================================================
    // 报告二：NextGen 家族教育战略
    // ===========================================================
    // ===========================================================
    // 报告二：NextGen 家族教育战略（正式重构版，8模块33题）
    // ===========================================================
    family: [
      // ---- 模块 A：家庭当前所处阶段 ----
      {
        id: 'f_module_a',
        title: '模块 A：家庭当前所处阶段',
        desc: '请回答您当前最想解决的核心问题，系统将据此确定分析优先级。',
        insight: '家庭所处阶段与决策成熟度，是制定教育战略的首要判断依据。',
        fields: [
          {
            id: 'mainProblem',
            label: '您当前最想为孩子解决的是哪一类问题？',
            type: 'radio',
            required: true,
            options: [
              '判断是否适合国际化教育路径',
              '判断具体走哪个国家/地区更合适',
              '判断投入是否值得、该如何投入',
              '判断孩子长期该走什么方向',
            ],
          },
          {
            id: 'childStage',
            label: '孩子当前所处阶段是？',
            type: 'radio',
            required: true,
            options: [
              '小学及以下',
              '初中',
              '高中',
              '本科',
              '已毕业 / Gap 中',
            ],
          },
          {
            id: 'schoolTypeF',
            label: '孩子当前所在学校更接近哪一类？',
            type: 'radio',
            required: true,
            options: [
              '国内公立学校',
              '国际学校 / 国际课程学校',
              '海外学校',
              '国内本科院校',
              '其他',
            ],
          },
          {
            id: 'intlPathDecision',
            label: '您现在对"是否走国际化路径"的判断更接近哪种情况？',
            type: 'radio',
            required: true,
            options: [
              '已经基本确定要走',
              '大概率会走，但还在比较',
              '还在判断，不确定是否适合',
              '目前主要是先了解一下',
            ],
          },
          {
            id: 'applyTiming',
            label: '您希望孩子大概在多久之后进入正式申请或路径选择阶段？',
            type: 'radio',
            required: true,
            options: [
              '1 年内',
              '1–2 年内',
              '2–4 年内',
              '4 年以上',
              '目前还不确定',
            ],
          },
        ],
      },
      // ---- 模块 B：孩子当前的基础状态 ----
      {
        id: 'f_module_b',
        title: '模块 B：孩子当前的基础状态',
        desc: '请如实评估孩子当前的学习状态与发展特征，系统将据此建立孩子画像。',
        insight: '孩子的真实基础状态是判断适合哪条路径的核心依据。',
        fields: [
          {
            id: 'academicPerformance',
            label: '您对孩子当前整体学业表现的判断更接近哪一项？',
            type: 'radio',
            required: true,
            options: [
              '在当前环境中明显靠前',
              '整体稳定，属于中上水平',
              '中等水平，但还有提升空间',
              '当前表现不够稳定',
              '暂时不好判断',
            ],
          },
          {
            id: 'childStrengths',
            label: '孩子目前的优势更接近哪几个方面？（最多选 3）',
            type: 'checkbox',
            maxSelect: 3,
            options: [
              '学术成绩和学习能力',
              '英语或语言能力',
              '表达与沟通',
              '自驱力和执行力',
              '创造力和兴趣探索',
              '组织能力和领导力',
              '暂时还没有特别突出的优势',
            ],
          },
          {
            id: 'childWeaknesses',
            label: '孩子目前更明显的短板更接近哪些方面？（最多选 3）',
            type: 'checkbox',
            maxSelect: 3,
            options: [
              '学业基础不够稳',
              '英语/语言能力不足',
              '缺少明确方向',
              '缺少持续投入和自驱力',
              '课外经历不够丰富',
              '家庭还没形成清晰规划',
              '暂时不太确定',
            ],
          },
          {
            id: 'directionClarity',
            label: '您觉得孩子现在对自己的未来方向是否清晰？',
            type: 'radio',
            required: true,
            options: [
              '非常清晰',
              '大致清晰',
              '比较模糊',
              '基本没有方向感',
            ],
          },
          {
            id: 'childState',
            label: '孩子目前更接近哪种状态？',
            type: 'radio',
            required: true,
            options: [
              '已经在有意识地为未来做准备',
              '有一些尝试，但不够系统',
              '更多是跟着学校节奏走',
              '还没有真正开始规划',
            ],
          },
        ],
      },
      // ---- 模块 C：家庭教育目标与价值排序 ----
      {
        id: 'f_module_c',
        title: '模块 C：家庭教育目标与价值排序',
        desc: '请明确家庭在教育选择中的核心价值排序，系统将据此判断路径方向。',
        insight: '家庭教育目标的价值排序，将直接影响国家路径与资源配置建议。',
        fields: [
          {
            id: 'familyValues',
            label: '家庭在教育选择中最看重的是什么？（最多选 3）',
            type: 'checkbox',
            maxSelect: 3,
            options: [
              '学校层级和品牌',
              '长期就业与职业发展',
              '国际化视野和平台',
              '孩子个人成长与适配',
              '路径稳妥和结果确定性',
              '投入产出比 / 性价比',
            ],
          },
          {
            id: 'firstPriority',
            label: '如果必须排序，您目前最看重的第一优先级是什么？',
            type: 'radio',
            required: true,
            options: [
              '尽可能进入更高层级学校',
              '路径长期回报更高',
              '孩子真正适合并能走得顺',
              '家庭投入更可控、结果更稳',
            ],
          },
          {
            id: 'hopeChildBecome',
            label: '您更希望孩子未来成为哪类人？',
            type: 'radio',
            required: true,
            options: [
              '学术能力强、能进入顶尖环境的人',
              '职业发展强、结果导向清晰的人',
              '国际化视野强、综合能力强的人',
              '稳定、自洽、能持续成长的人',
            ],
          },
          {
            id: 'educationRole',
            label: '在您看来，教育最重要的作用更接近哪一项？',
            type: 'radio',
            required: true,
            options: [
              '帮孩子进入更高的平台',
              '帮孩子建立长期竞争力',
              '帮孩子找到更适合自己的路径',
              '帮孩子获得更稳定的未来结果',
            ],
          },
        ],
      },
      // ---- 模块 D：国家/地区与路径偏好 ----
      {
        id: 'f_module_d',
        title: '模块 D：国家/地区与路径偏好',
        desc: '请填写家庭对国家/地区的偏好，系统将据此生成定制化路径对比分析。',
        insight: '国家/地区选择将从成本、门槛、稳定性、就业四个维度进行对比分析。',
        fields: [
          {
            id: 'preferCountries',
            label: '您目前优先考虑的国家/地区有哪些？（最多选 4）',
            type: 'checkbox',
            maxSelect: 4,
            options: [
              '美国',
              '英国',
              '香港',
              '新加坡',
              '加拿大',
              '澳大利亚',
              '欧洲',
              '其他地区',
              '暂不确定',
            ],
          },
          {
            id: 'countryPreferenceReason',
            label: '您当前对这些国家/地区的偏好更主要来自什么？（最多选 3）',
            type: 'checkbox',
            maxSelect: 3,
            options: [
              '学校整体实力',
              '专业资源与项目质量',
              '未来就业与发展机会',
              '环境安全与生活体验',
              '国际化程度',
              '家庭熟悉度或已有资源',
              '费用与投入可控',
              '还没有系统判断，更多是直觉偏好',
            ],
          },
          {
            id: 'preferredEnvironment',
            label: '如果未来孩子要在一个地方长期学习和生活，您更偏向哪种环境？',
            type: 'radio',
            required: true,
            options: [
              '国际化程度高、机会多的大城市',
              '节奏平衡、教育资源强的城市',
              '安静、适合专注学习的中小城市',
              '更看重安全感和生活舒适度',
              '暂时不好判断',
            ],
          },
          {
            id: 'pathRhythm',
            label: '您更能接受哪种路径节奏？',
            type: 'radio',
            required: true,
            options: [
              '提前很久开始布局，走长期规划路线',
              '在关键阶段集中投入，抓重点',
              '先观望，等方向更清晰再投入',
              '希望系统判断什么节奏更合适',
            ],
          },
        ],
      },
      // ---- 模块 E：家庭投入方式与预算观 ----
      {
        id: 'f_module_e',
        title: '模块 E：家庭投入方式与预算观',
        desc: '了解家庭的投入偏好，系统将据此给出最符合实际的资源配置建议。',
        insight: '资源投入方向的优先级，将影响短期补强策略与长期路径设计。',
        fields: [
          {
            id: 'budgetAttitude',
            label: '家庭目前对教育投入的态度更接近哪一项？',
            type: 'radio',
            required: true,
            options: [
              '只要路径正确，可以接受较高投入',
              '愿意投入，但会考虑回报和节奏',
              '比较看重性价比，希望理性投入',
              '希望先判断值不值得再决定',
            ],
          },
          {
            id: 'investFocus',
            label: '如果未来需要投入更多资源，您更愿意优先投入在哪些方面？（最多选 2）',
            type: 'checkbox',
            maxSelect: 2,
            options: [
              '学业成绩和课程表现',
              '语言和标化准备',
              '科研 / 实习 / 项目',
              '国际项目与平台经历',
              '长期方向规划与咨询',
              '还希望系统帮我判断',
            ],
          },
          {
            id: 'familyWorries',
            label: '家庭目前更担心哪类问题？（最多选 2）',
            type: 'checkbox',
            maxSelect: 2,
            options: [
              '投入很多但结果一般',
              '选错国家/路径',
              '孩子其实并不适合当前设想',
              '准备太晚，错过窗口',
              '家长和孩子目标不一致',
              '信息太多，不知道该信什么',
            ],
          },
          {
            id: 'earlyPlanningAttitude',
            label: '您对"早规划、早布局"这件事的态度更接近哪一项？',
            type: 'radio',
            required: true,
            options: [
              '非常认可，越早越好',
              '认可，但要看孩子状态',
              '可以做，但不想过度焦虑',
              '还不确定是否有必要',
            ],
          },
        ],
      },
      // ---- 模块 F：亲子目标一致性与决策矛盾 ----
      {
        id: 'f_module_f',
        title: '模块 F：亲子目标一致性与决策矛盾',
        desc: '亲子目标的一致性是教育决策能否顺利落地的关键因素，请如实填写。',
        insight: '系统将据此分析亲子目标的对齐度，并给出沟通与决策建议。',
        fields: [
          {
            id: 'parentChildAlignment',
            label: '您和孩子目前在目标上更接近哪种情况？',
            type: 'radio',
            required: true,
            options: [
              '基本一致',
              '有少量分歧，但能沟通',
              '分歧比较明显',
              '目前还没真正深入聊过',
            ],
          },
          {
            id: 'gapAreas',
            label: '如果存在分歧，主要更接近哪一类？（最多选 2）',
            type: 'checkbox',
            maxSelect: 2,
            options: [
              '国家/地区选择',
              '学校层级期待',
              '专业方向',
              '是否要走国际化路径',
              '投入节奏与预算',
              '孩子未来到底适合什么',
            ],
          },
          {
            id: 'hardestDecision',
            label: '您目前在家庭教育决策中最难做的判断是什么？',
            type: 'radio',
            required: true,
            options: [
              '该不该走国际化路径',
              '该走哪个国家/地区',
              '该何时开始系统布局',
              '该如何在目标和投入之间做平衡',
              '该如何判断孩子真正适合什么',
            ],
          },
          {
            id: 'hopeSystemDecide',
            label: '如果系统最终给出判断，您更希望它帮助您做哪类决定？',
            type: 'radio',
            required: true,
            options: [
              '判断哪条路径最适合',
              '判断哪个国家更适合',
              '判断现在是否该开始重点投入',
              '判断家庭的钱和时间该怎么投',
              '判断孩子与家庭目标是否匹配',
            ],
          },
        ],
      },
      // ---- 模块 G：孩子的学习方式与长期发展倾向 ----
      {
        id: 'f_module_g',
        title: '模块 G：孩子的学习方式与长期发展倾向',
        desc: '这部分通过具体情境题推理孩子的学习特征，请根据您的观察作答。',
        insight: '孩子的学习方式与长期发展倾向，是判断哪条成长路径更合适的重要依据。',
        fields: [
          {
            id: 'newThingReaction',
            label: '您觉得孩子在面对新事物时更接近哪种状态？',
            type: 'radio',
            required: true,
            options: [
              '先大量了解，再决定要不要深入',
              '先试着做一点，在实践中慢慢判断',
              '更依赖老师或家长引导',
              '不同领域反应不太一样',
            ],
          },
          {
            id: 'learningEnvironment',
            label: '孩子更适应哪种学习环境？',
            type: 'radio',
            required: true,
            options: [
              '竞争强、要求高、节奏快的环境',
              '资源丰富、机会多、国际化强的环境',
              '更安静、适合深入学习和积累的环境',
              '目前还不太能判断',
            ],
          },
          {
            id: 'learningStyle',
            label: '孩子在学习上更接近哪种方式？',
            type: 'radio',
            required: true,
            options: [
              '更适合理论学习和系统理解',
              '更适合项目实践和边做边学',
              '理论和实践都需要，偏科都不行',
              '目前还没有特别明确的倾向',
            ],
          },
          {
            id: 'developmentRhythm',
            label: '孩子未来更适合哪种发展节奏，您的直觉更接近哪项？',
            type: 'radio',
            required: true,
            options: [
              '尽早明确目标，持续深耕一条主线',
              '先多尝试，再逐步收敛方向',
              '先把学业基础打稳，再考虑更远路径',
              '希望系统帮我判断哪种方式更适合',
            ],
          },
          {
            id: 'postGradTendency',
            label: '如果未来毕业后做选择，您觉得孩子更接近哪种倾向？',
            type: 'radio',
            required: true,
            options: [
              '更适合继续深造、读更高学位',
              '更适合尽早进入工作与实践',
              '两种都有可能，要看路径怎么选',
              '目前不好判断',
            ],
          },
        ],
      },
      // ---- 模块 H：报告目标 ----
      {
        id: 'f_module_h',
        title: '模块 H：报告目标',
        desc: '请告诉系统您最想从这份报告中获得哪些判断，系统将重点围绕这些核心问题展开分析。',
        insight: '明确诉求将帮助系统生成更具针对性的战略建议。',
        fields: [
          {
            id: 'reportFocus',
            label: '您最希望这份报告重点帮助您解决什么？（最多选 2）',
            type: 'checkbox',
            maxSelect: 2,
            options: [
              '判断孩子是否适合国际化路径',
              '判断更适合哪些国家/地区',
              '判断家庭的钱和时间应该如何投入',
              '判断孩子长期更适合什么发展路径',
              '判断当前最应该先解决的决策问题是什么',
            ],
          },
          {
            id: 'mostCriticalThing',
            label: '如果这份报告能帮您解决一件最关键的事，您最希望它解决什么？',
            type: 'radio',
            required: true,
            options: [
              '给出更清晰的方向判断',
              '给出更理性的投入建议',
              '给出更适合孩子的路径比较',
              '帮我减少当前的决策焦虑',
            ],
          },
        ],
      },
    ],


    // ===========================================================
    // 报告三：Life-Career Strategy 人生生涯全规划
    // ===========================================================
    career: [
      // ---- 模块 A：当前阶段与基本背景 ----
      {
        id: 'c_module_a',
        title: '模块 A：当前阶段与基本背景',
        desc: '请填写你当前的基本情况，系统将以此建立你的背景画像。',
        insight: '了解你的当前阶段与背景，是生成精准生涯规划的基础。',
        fields: [
          {
            id: 'currentStage',
            label: '你当前所处阶段是？',
            type: 'radio',
            required: true,
            options: [
              '初中',
              '高中',
              '本科',
              '已毕业 / Gap 中',
            ],
          },
          {
            id: 'schoolName',
            label: '你目前所在学校名称是？',
            type: 'text',
            placeholder: '例：上海某国际高中、北京大学等',
          },
          {
            id: 'schoolType',
            label: '你目前所在学校更接近哪一类？',
            type: 'radio',
            required: true,
            options: [
              '国内公立学校',
              '国际学校 / 国际课程学校',
              '国内本科院校',
              '海外学校 / 海外本科院校',
              '其他',
            ],
          },
          {
            id: 'gradeLevel',
            label: '你当前所在年级/阶段是？',
            type: 'radio',
            required: true,
            options: [
              '初中 / 9 年级及以下',
              '高中低年级 / 10–11 年级',
              '高中高年级 / 12 年级及申请阶段',
              '本科低年级 / 大一大二',
              '本科高年级 / 大三大四或已毕业',
            ],
          },
          {
            id: 'reportGoal',
            label: '你更希望这份报告帮助你解决哪类问题？',
            type: 'radio',
            required: true,
            options: [
              '判断未来更适合什么专业',
              '判断未来更适合什么职业方向',
              '判断当前最该补什么能力',
              '判断未来 3–5 年怎么规划',
              '都希望系统综合判断',
            ],
          },
        ],
      },
      // ---- 模块 B：当前学习状态与成长基础 ----
      {
        id: 'c_module_b',
        title: '模块 B：当前学习状态与成长基础',
        desc: '请如实评估当前的学习状态与能力特征，系统将据此建立你的成长基础画像。',
        insight: '当前能力结构的真实判断，是生成精准方向建议的核心依据。',
        fields: [
          {
            id: 'learningState',
            label: '你当前对自己的整体学习状态判断更接近哪一项？',
            type: 'radio',
            required: true,
            options: [
              '整体比较稳定，知道自己擅长什么',
              '学习还不错，但方向感不足',
              '有一些亮点，但整体不够系统',
              '目前比较迷茫，缺少明确主线',
            ],
          },
          {
            id: 'strongTaskTypes',
            label: '你目前更容易在什么类型的任务里表现较好？（最多选 3）',
            type: 'checkbox',
            maxSelect: 3,
            options: [
              '需要逻辑分析和推理的任务',
              '需要阅读、理解和整理复杂信息的任务',
              '需要沟通、表达和说服他人的任务',
              '需要组织协调和推动事情落地的任务',
              '需要创意、内容或设计表达的任务',
              '需要长期钻研、耐心积累的任务',
            ],
          },
          {
            id: 'weakTaskTypes',
            label: '你目前更容易在哪类场景里感到吃力？（最多选 2）',
            type: 'checkbox',
            maxSelect: 2,
            options: [
              '高强度学术任务',
              '长时间专注和深度钻研',
              '与人沟通表达',
              '在团队中组织和推动事情',
              '把想法落到真实项目中',
              '做选择时判断不清方向',
            ],
          },
          {
            id: 'growthState',
            label: '你当前更接近哪种成长状态？',
            type: 'radio',
            required: true,
            options: [
              '已经在主动为未来做准备',
              '有一些尝试，但还比较零散',
              '大多还是跟着学校节奏走',
              '还没有真正开始思考长期方向',
            ],
          },
        ],
      },
      // ---- 模块 C：兴趣方向与持续投入倾向 ----
      {
        id: 'c_module_c',
        title: '模块 C：兴趣方向与持续投入倾向',
        desc: '请真实描述你感兴趣的方向，以及更愿意持续投入的事情类型。',
        insight: '兴趣的持续性与具体程度，是判断方向匹配度的核心维度。',
        fields: [
          {
            id: 'interestFields',
            label: '你现在最感兴趣的方向有哪些？（最多选 4）',
            type: 'checkbox',
            maxSelect: 4,
            options: [
              '商业 / 金融 / 经济',
              '计算机 / AI / 数据',
              '工程 / 机械 / 电子 / 物理',
              '生物 / 医学 / 健康相关',
              '心理学 / 教育',
              '社会科学 / 公共政策 / 国际关系',
              '法律',
              '传媒 / 内容 / 文化传播',
              '设计 / 艺术 / 创意表达',
              '还没有明确方向',
            ],
          },
          {
            id: 'sustainedFocus',
            label: '哪类事情更容易让你持续投入很久？',
            type: 'radio',
            required: true,
            options: [
              '复杂问题和逻辑推理',
              '真正做出一个项目或成果',
              '理解人与社会、政策、组织运作',
              '讲清楚一个观点、输出内容或表达创意',
              '目前还在探索',
            ],
          },
          {
            id: 'freeTimeChoice',
            label: '如果没有考试压力，你更愿意把时间花在哪类事情上？',
            type: 'radio',
            required: true,
            options: [
              '学习新知识、看书、钻研问题',
              '做项目、做产品、做实验或实操',
              '参加活动、社团、组织合作',
              '写内容、表达想法、做创意类事情',
              '暂时说不清楚',
            ],
          },
          {
            id: 'decisionDriver',
            label: '你做选择时，通常更容易被什么吸引？',
            type: 'radio',
            required: true,
            options: [
              '这个方向逻辑上很有意思',
              '这个方向现实结果很好',
              '这个方向让我能持续保持兴趣',
              '这个方向的平台和资源很强',
              '往往多个因素一起考虑',
            ],
          },
        ],
      },
      // ---- 模块 D：学习方式与环境偏好 ----
      {
        id: 'c_module_d',
        title: '模块 D：学习方式与环境偏好',
        desc: '请选择最符合你实际情况的选项，帮助系统判断最适合你的成长环境。',
        insight: '学习方式与环境偏好的匹配，将影响路径选择与学校/机构建议。',
        fields: [
          {
            id: 'learningStyle',
            label: '你更适应哪种学习方式？',
            type: 'radio',
            required: true,
            options: [
              '先系统理解理论框架，再开始做',
              '先上手实践，在做的过程中理解',
              '理论和实践必须交替进行',
              '不同学科差异很大',
            ],
          },
          {
            id: 'studyEnvironmentPref',
            label: '如果进入大学或研究生阶段，你更希望自己的学习状态接近哪一种？',
            type: 'radio',
            required: true,
            options: [
              '以学术研究和深度学习为主',
              '以项目实践和应用能力为主',
              '既有学术深度，也有实践机会',
              '目前还不确定',
            ],
          },
          {
            id: 'campusLifePref',
            label: '你更喜欢哪种学习/生活环境？',
            type: 'radio',
            required: true,
            options: [
              '节奏快、竞争强、身边高手很多',
              '国际化强、资源多、机会密集',
              '相对安静、适合沉下心来积累',
              '平衡一些，学习与生活都比较稳定',
            ],
          },
          {
            id: 'cityPref',
            label: '如果未来长期在一个城市生活，你更偏向哪种地方？',
            type: 'radio',
            required: true,
            options: [
              '文化多样性强、机会多的大城市',
              '资源很强但生活秩序稳定的城市',
              '学术氛围浓、适合专注学习的中小城市',
              '更看重舒适、安全和长期生活感',
            ],
          },
          {
            id: 'newFieldReaction',
            label: '当你面对一个不熟悉的领域时，通常更接近哪种反应？',
            type: 'radio',
            required: true,
            options: [
              '先大量搜集信息，再决定是否深入',
              '先做一点、试一点，再看自己适不适合',
              '先找懂的人聊，看看这个方向真实是什么样',
              '经常先凭兴趣进入，再慢慢修正',
            ],
          },
        ],
      },
      // ---- 模块 E：未来路径与结果偏好 ----
      {
        id: 'c_module_e',
        title: '模块 E：未来路径与结果偏好',
        desc: '请描述你对未来路径和结果的偏好，系统将据此判断最适合的发展方向。',
        insight: '对结果类型的偏好，是判断路径优先级与职业方向的重要参考。',
        fields: [
          {
            id: 'postGradDirection',
            label: '如果毕业后要尽快做选择，你现在更偏向哪种方向？',
            type: 'radio',
            required: true,
            options: [
              '尽快进入工作与实践环境',
              '先继续深造，再决定长期方向',
              '先工作，再择机继续深造',
              '目前还不好判断',
            ],
          },
          {
            id: 'phdAttitude',
            label: '你对更高学位（如博士等）的态度更接近哪一项？',
            type: 'radio',
            required: true,
            options: [
              '明显有兴趣',
              '不排斥，但要看方向和值不值得',
              '目前更倾向就业',
              '还没有认真想过',
            ],
          },
          {
            id: 'futureOutcomes',
            label: '你未来最看重哪类结果？（最多选 2）',
            type: 'checkbox',
            maxSelect: 2,
            options: [
              '高收入与回报',
              '稳定与确定性',
              '兴趣和长期投入感',
              '国际化机会与平台',
              '社会影响力或成就感',
              '长期成长空间',
            ],
          },
          {
            id: 'futureSelfImage',
            label: '你更希望未来的自己接近哪种状态？',
            type: 'radio',
            required: true,
            options: [
              '在一个专业领域里很强、很深',
              '在现实世界里很能解决问题',
              '能连接资源、组织事情、带动别人',
              '有清晰表达和创造影响力的能力',
              '目前还没有形成明确想象',
            ],
          },
        ],
      },
      // ---- 模块 F：实践经历与方向验证 ----
      {
        id: 'c_module_f',
        title: '模块 F：实践经历与方向验证',
        desc: '请如实填写已有的经历，系统将据此判断方向验证程度与经历完整度。',
        insight: '已有经历的质量和方向，是判断能力现状和下一步优先级的重要依据。',
        fields: [
          {
            id: 'expTypes',
            label: '你目前已经有过哪些经历？（最多选 6）',
            type: 'checkbox',
            maxSelect: 6,
            options: [
              '学术竞赛',
              '科研 / 研究项目',
              '实习 / 工作实践',
              '社团 / 学生组织',
              '志愿活动 / 公益经历',
              '创业 / 项目实践',
              '国际项目 / 夏校 / 交换',
              '内容输出 / 作品集 / 公开成果',
              '暂无特别突出的经历',
            ],
          },
          {
            id: 'expResearch',
            label: '科研 / 研究项目经历',
            type: 'textarea',
            conditional: { field: 'expTypes', includes: '科研 / 研究项目' },
            placeholder: '请填写你最有代表性的 1–2 项科研或研究经历。',
          },
          {
            id: 'expInternship',
            label: '实习 / 工作实践经历',
            type: 'textarea',
            conditional: { field: 'expTypes', includes: '实习 / 工作实践' },
            placeholder: '请填写你最有代表性的 1–2 项实习或实践经历。',
          },
          {
            id: 'expClub',
            label: '社团 / 学生组织经历',
            type: 'textarea',
            conditional: { field: 'expTypes', includes: '社团 / 学生组织' },
            placeholder: '请填写你最有代表性的 1–2 项组织或活动经历。',
          },
          {
            id: 'expEntrepreneur',
            label: '创业 / 项目实践经历',
            type: 'textarea',
            conditional: { field: 'expTypes', includes: '创业 / 项目实践' },
            placeholder: '请填写你最有代表性的 1–2 项项目经历。',
          },
          {
            id: 'expPortfolio',
            label: '内容输出 / 作品集 / 公开成果',
            type: 'textarea',
            conditional: { field: 'expTypes', includes: '内容输出 / 作品集 / 公开成果' },
            placeholder: '请填写你最有代表性的 1–2 项成果。',
          },
          {
            id: 'expOverallState',
            label: '这些经历目前更接近哪种状态？',
            type: 'radio',
            required: true,
            options: [
              '已经能体现出比较明确的方向',
              '有一些经历，但还看不出稳定主线',
              '经历不少，但偏分散',
              '整体还比较空白',
            ],
          },
          {
            id: 'expFutureDirection',
            label: '你更希望未来的经历积累偏向哪类？',
            type: 'radio',
            required: true,
            options: [
              '更偏学术和研究',
              '更偏项目和实践',
              '更偏综合发展',
              '还希望系统帮我判断',
            ],
          },
        ],
      },
      // ---- 模块 G：关键限制与成长阻力 ----
      {
        id: 'c_module_g',
        title: '模块 G：关键限制与成长阻力',
        desc: '请如实评估当前发展的主要障碍，系统将据此判断优先补强方向。',
        insight: '承认限制并正确定位阻力，是制定有效发展计划的前提。',
        fields: [
          {
            id: 'mainLimitation',
            label: '你觉得当前最限制自己发展的问题更接近哪一项？',
            type: 'radio',
            required: true,
            options: [
              '学术基础还不够稳',
              '缺少明确方向',
              '缺少实践和成果',
              '缺少持续投入和执行力',
              '选择太多，反而难以下判断',
            ],
          },
          {
            id: 'priorityBreakthrough',
            label: '如果未来 1–2 年只能重点突破一个问题，你觉得最需要先解决什么？',
            type: 'radio',
            required: true,
            options: [
              '方向感不清晰',
              '学术或能力基础不够',
              '缺少项目/实践经历',
              '缺少长期主线和持续积累',
              '还需要系统帮我判断',
            ],
          },
          {
            id: 'futureWorries',
            label: '你当前最担心未来发展的什么问题？（最多选 2）',
            type: 'checkbox',
            maxSelect: 2,
            options: [
              '选错专业或方向',
              '现在做的事情对长期没用',
              '没有形成真正的竞争力',
              '未来职业方向不清楚',
              '自己的投入和结果不匹配',
              '发展节奏太慢，怕错过机会',
            ],
          },
        ],
      },
      // ---- 模块 H：报告目标 ----
      {
        id: 'c_module_h',
        title: '模块 H：报告目标',
        desc: '请告诉系统你最想从这份报告中获得哪些判断，系统将重点围绕这些问题展开分析。',
        insight: '明确诉求将帮助系统生成更有针对性的生涯建议。',
        fields: [
          {
            id: 'reportFocus',
            label: '你最希望这份报告重点告诉你的是什么？（最多选 2）',
            type: 'checkbox',
            maxSelect: 2,
            options: [
              '我更适合什么专业方向',
              '我更适合什么职业方向',
              '我当前最该补什么能力',
              '我未来 3–5 年应该怎么规划',
              '我现在做的事情值不值得继续投入',
            ],
          },
          {
            id: 'mostCriticalJudgment',
            label: '如果系统最终只能给你一个最关键的判断，你最希望它给出什么？',
            type: 'radio',
            required: true,
            options: [
              '更适合哪条长期路径',
              '最需要先补的核心能力',
              '当前方向是不是走对了',
              '未来几年最应该怎么布局',
            ],
          },
        ],
      },
    ],
  };

  // 向后兼容：默认用 competitiveness 的 steps（legacy代码保护）
  const QUESTIONNAIRE_STEPS = QUESTIONNAIRE_STEPS_MAP.competitiveness;

  // 获取特定报告类型的问卷步骤
  function getQuestionnaireSteps(reportType) {
    return QUESTIONNAIRE_STEPS_MAP[reportType] || QUESTIONNAIRE_STEPS_MAP.competitiveness;
  }

  // ---- AI Prompt Templates ----
  const PROMPT_TEMPLATES = {
    competitiveness: {
      systemPrompt: `你是全球顶级留学申请战略顾问，拥有藤校招生官背景和10年以上高端申请经验。
你的任务是基于学生问卷档案数据，生成一份《全球留学竞争力评估报告》的完整结构化JSON数据。

核心原则：
1. 报告必须专业、有深度、克制，保持咨询感而非营销话术
2. 既要让家长看到机会，也要明确指出关键短板和风险
3. 不要把所有方案一次说完，保留引导后续咨询的空间
4. 文字内容要有实质信息量，避免套话和废话
5. 每一节的文字长度严格符合要求（字数说明见每个字段）
6. 必须返回有效的JSON对象，不要有任何markdown标记或代码块，直接返回JSON`,

      buildPrompt: (data) => {
        // 整理关键字段用于 prompt 构建
        const applyGoal = data.applyGoal || '未填写';
        const schoolName = data.schoolName || '未填写';
        const schoolType = data.schoolTypeHS || data.schoolTypeUG || '未填写';
        const grade = data.gradeHS || data.gradeUG || '未填写';
        const enrollTime = data.enrollTime || '未填写';
        const gpaScore = data.gpaScore || '未填写';
        const rankLevel = data.rankLevel || '未填写';
        const curriculum = data.curriculumHS || data.curriculumUG || '未填写';
        const academicState = data.academicState || '未填写';
        const strongSubjects = Array.isArray(data.strongSubjects) ? data.strongSubjects.join('、') : (data.strongSubjects || '未填写');
        const hasLangScore = data.hasLangScore || '未填写';
        const langScore = data.langScore || '未填写';
        const hasStdScore = data.hasStdScoreHS || data.hasStdScoreUG || '未填写';
        const stdScore = data.stdScore || '未填写';
        const testReadiness = data.testReadiness || '未填写';
        const targetMajors = Array.isArray(data.targetMajors) ? data.targetMajors.join('、') : (data.targetMajors || '未填写');
        const majorClarity = data.majorClarity || '未填写';
        const targetCountries = Array.isArray(data.targetCountries) ? data.targetCountries.join('、') : (data.targetCountries || '未填写');
        const countryReasons = Array.isArray(data.countryReasons) ? data.countryReasons.join('、') : (data.countryReasons || '未填写');
        const tierExpectation = data.tierExpectation || '未填写';
        const expTypes = Array.isArray(data.expTypes) ? data.expTypes.join('、') : (data.expTypes || '未填写');
        const expDetails = [
          data.expCompetition ? '【竞赛】' + data.expCompetition : null,
          data.expResearch ? '【科研】' + data.expResearch : null,
          data.expInternship ? '【实习】' + data.expInternship : null,
          data.expClub ? '【社团】' + data.expClub : null,
          data.expVolunteer ? '【志愿】' + data.expVolunteer : null,
          data.expEntrepreneur ? '【创业】' + data.expEntrepreneur : null,
          data.expInternational ? '【国际项目】' + data.expInternational : null,
          data.expPortfolio ? '【作品集】' + data.expPortfolio : null,
        ].filter(Boolean).join('\n') || '暂无具体描述';
        const expOverallState = data.expOverallState || '未填写';
        const expInvestStyle = data.expInvestStyle || '未填写';
        const preferEnv = data.preferEnv || '未填写';
        const learningStyle = data.learningStyle || '未填写';
        const studyOrientation = data.studyOrientation || '未填写';
        const postGradPlan = data.postGradPlan || '未填写';
        const mainWorries = Array.isArray(data.mainWorries) ? data.mainWorries.join('、') : (data.mainWorries || '未填写');
        const prepState = data.prepState || '未填写';
        const familyExpectation = data.familyExpectation || '未填写';
        const reportFocus = Array.isArray(data.reportFocus) ? data.reportFocus.join('、') : (data.reportFocus || '未填写');

        return `请基于以下学生问卷档案，生成《全球留学竞争力评估报告》完整结构化数据：

===== 学生档案 =====

【模块 A：申请目标与学校情况】
申请目标：${applyGoal}
当前学校：${schoolName}
学校类型：${schoolType}
当前阶段：${grade}
计划入学时间：${enrollTime}

【模块 B：学术表现】
GPA / 均分：${gpaScore}
排名情况：${rankLevel}
课程体系：${curriculum}
学业状态：${academicState}
强势学科方向：${strongSubjects}

【模块 C：语言与标化】
是否有语言成绩：${hasLangScore}
语言成绩：${langScore}
是否有标化成绩：${hasStdScore}
标化成绩：${stdScore}
测试准备状态：${testReadiness}

【模块 D：专业方向与国家偏好】
感兴趣的专业方向：${targetMajors}
专业方向清晰度：${majorClarity}
目标国家/地区：${targetCountries}
选择国家的主要原因：${countryReasons}
学校层级期待：${tierExpectation}

【模块 E：背景经历】
已有经历类型：${expTypes}
经历详情：
${expDetails}
经历整体状态：${expOverallState}
课外投入方式：${expInvestStyle}

【模块 F：学习方式与发展倾向】
偏好学习环境：${preferEnv}
学习方式：${learningStyle}
学习导向：${studyOrientation}
毕业后规划：${postGradPlan}

【模块 G：申请风险与报告目标】
主要担忧：${mainWorries}
准备状态：${prepState}
家庭期待：${familyExpectation}
报告关注点：${reportFocus}

===================

请严格按照以下JSON格式返回（所有文字内容必须是中文，字数要求请严格遵守）：
{
  "overallScore": 数字(0-100，综合竞争力指数),
  "scoringDimensions": {
    "academics": 数字(0-100，学术基础),
    "testScores": 数字(0-100，语言/标化竞争力),
    "majorFit": 数字(0-100，专业方向成熟度),
    "backgroundDepth": 数字(0-100，背景经历完整度),
    "highVisibility": 数字(0-100，高辨识度成果),
    "narrativeMaturity": 数字(0-100，申请叙事成熟度)
  },
  "reportSummary": "150-200字的报告摘要，一句话统领，说明当前申请竞争力判断",
  "competitivenessAnalysis": "300-350字，写：当前处于什么申请层级；为什么具备一定冲刺空间；为什么还不能盲目乐观；结合学生的申请目标（本科/硕士）具体分析",
  "schoolRecommendations": {
    "reach": [{"name": "院校名（英文全称）", "country": "国家", "qs": "QS或US News排名", "matchScore": 数字(0-100), "whyReach": "50字内说明为什么是冲刺"}],
    "match": [{"name": "院校名（英文全称）", "country": "国家", "qs": "QS或US News排名", "matchScore": 数字(0-100), "whyMatch": "50字内说明为什么是匹配"}],
    "schoolAnalysisText": "450-550字，分析为什么这几所是冲刺、为什么这几所更匹配、为什么当前不是更高或更低层级，结合目标国家偏好给出判断依据"
  },
  "gapAnalysis": {
    "keyGaps": [{"level": "critical|important|note", "title": "短板名称", "desc": "100字内具体说明", "impactOnResult": "对申请结果的影响说明"}],
    "gapAnalysisText": "450-550字，写最大短板是什么；为什么这些短板会限制更高层级机会；风险最明显体现在哪些维度；与学生的担忧相互印证"
  },
  "targetMajorRisk": [{"major": "专业方向", "riskLevel": "低风险|中风险|高风险", "riskScore": 数字(0-100，越高风险越大), "riskNote": "50字内风险说明"}],
  "priorityMatrix": [{"item": "补强项目名称", "impactScore": 数字(0-100，对申请结果影响程度), "feasibilityScore": 数字(0-100，可改善程度), "priority": "high|medium|low"}],
  "reinforcementPlan": {
    "reinforcementText": "350-450字，结合学生的入学时间窗口和当前准备状态，写最优先补强什么；为什么先补这些；哪些投入是高价值的；哪些投入短期内意义不大",
    "topActions": [{"action": "具体行动", "timeline": "建议时间", "expectedImpact": "预期效果"}]
  },
  "conclusion": "100-150字结语，自然引出后续咨询，但不生硬，提及代金券可用于预约荔智惠专业顾问"
  }
`;
      },

    },

    family: {
      systemPrompt: `你是高端家庭教育战略顾问，专注于为高净值家庭提供国际化教育路径判断与家庭资源配置决策支持。
你的任务是基于家庭问卷档案数据，生成一份《NextGen家族教育战略智能报告》的完整结构化JSON数据。

报告核心定位：
这是一份"家庭教育战略判断报告"，不是留学申请报告的延伸版本。
核心目标：帮家庭判断"这类家庭适不适合走国际化路径、更适合哪条路径、钱和时间应该怎么投、当前决策里最大的误区和矛盾是什么"。

报告结构（7个模块）：
模块1：执行摘要（总判断，450-550字）
模块2：家庭教育目标画像（含雷达图）
模块3：学生画像与亲子目标一致性分析（含一致性分析图）
模块4：国家/地区路径判断（含国家路径对比图）
模块5：家庭资源投入建议（含资源配置建议图）
模块6：当前最关键的家庭决策问题
模块7：结语与代金券引导

核心原则：
1. 帮家长做判断，而不是帮家长看热闹
2. 先澄清方向，再识别矛盾，最后给出路径和投入建议
3. 语言要有判断力、有框架感，能让家长产生"被点醒"的感觉
4. 既要专业深度，又要保留引导后续咨询的空间
5. 必须返回有效的JSON对象，不要有任何markdown标记或代码块，直接返回JSON`,

      buildPrompt: (data) => {
        const mainProblem = data.mainProblem || '未填写';
        const childStage = data.childStage || '未填写';
        const schoolTypeF = data.schoolTypeF || '未填写';
        const intlPathDecision = data.intlPathDecision || '未填写';
        const applyTiming = data.applyTiming || '未填写';
        const academicPerformance = data.academicPerformance || '未填写';
        const childStrengths = Array.isArray(data.childStrengths) ? data.childStrengths.join('、') : (data.childStrengths || '未填写');
        const childWeaknesses = Array.isArray(data.childWeaknesses) ? data.childWeaknesses.join('、') : (data.childWeaknesses || '未填写');
        const directionClarity = data.directionClarity || '未填写';
        const childState = data.childState || '未填写';
        const familyValues = Array.isArray(data.familyValues) ? data.familyValues.join('、') : (data.familyValues || '未填写');
        const firstPriority = data.firstPriority || '未填写';
        const hopeChildBecome = data.hopeChildBecome || '未填写';
        const educationRole = data.educationRole || '未填写';
        const preferCountries = Array.isArray(data.preferCountries) ? data.preferCountries.join('、') : (data.preferCountries || '未填写');
        const countryPreferenceReason = Array.isArray(data.countryPreferenceReason) ? data.countryPreferenceReason.join('、') : (data.countryPreferenceReason || '未填写');
        const preferredEnvironment = data.preferredEnvironment || '未填写';
        const pathRhythm = data.pathRhythm || '未填写';
        const budgetAttitude = data.budgetAttitude || '未填写';
        const investFocus = Array.isArray(data.investFocus) ? data.investFocus.join('、') : (data.investFocus || '未填写');
        const familyWorries = Array.isArray(data.familyWorries) ? data.familyWorries.join('、') : (data.familyWorries || '未填写');
        const earlyPlanningAttitude = data.earlyPlanningAttitude || '未填写';
        const parentChildAlignment = data.parentChildAlignment || '未填写';
        const gapAreas = Array.isArray(data.gapAreas) ? data.gapAreas.join('、') : (data.gapAreas || '未填写');
        const hardestDecision = data.hardestDecision || '未填写';
        const hopeSystemDecide = data.hopeSystemDecide || '未填写';
        const newThingReaction = data.newThingReaction || '未填写';
        const learningEnvironment = data.learningEnvironment || '未填写';
        const learningStyle = data.learningStyle || '未填写';
        const developmentRhythm = data.developmentRhythm || '未填写';
        const postGradTendency = data.postGradTendency || '未填写';
        const reportFocus = Array.isArray(data.reportFocus) ? data.reportFocus.join('、') : (data.reportFocus || '未填写');
        const mostCriticalThing = data.mostCriticalThing || '未填写';

        return `请基于以下家庭档案，生成《NextGen家族教育战略智能报告》完整结构化数据：

===== 家庭档案 =====

【模块 A：家庭当前所处阶段】
当前最想解决的问题：${mainProblem}
孩子当前所处阶段：${childStage}
孩子当前学校类型：${schoolTypeF}
国际化路径判断：${intlPathDecision}
计划进入申请阶段的时间：${applyTiming}

【模块 B：孩子当前的基础状态】
整体学业表现：${academicPerformance}
孩子主要优势：${childStrengths}
孩子主要短板：${childWeaknesses}
对未来方向清晰度：${directionClarity}
孩子当前发展状态：${childState}

【模块 C：家庭教育目标与价值排序】
家庭最看重什么：${familyValues}
第一优先级：${firstPriority}
希望孩子成为哪类人：${hopeChildBecome}
教育最重要的作用：${educationRole}

【模块 D：国家/地区与路径偏好】
优先考虑的国家/地区：${preferCountries}
偏好来源：${countryPreferenceReason}
偏好的生活/学习环境：${preferredEnvironment}
可接受的路径节奏：${pathRhythm}

【模块 E：家庭投入方式与预算观】
教育投入态度：${budgetAttitude}
愿意优先投入的方向：${investFocus}
家庭主要担忧：${familyWorries}
对早规划的态度：${earlyPlanningAttitude}

【模块 F：亲子目标一致性与决策矛盾】
亲子目标一致情况：${parentChildAlignment}
分歧类型（如有）：${gapAreas}
最难做的决策：${hardestDecision}
希望系统帮助做哪类决定：${hopeSystemDecide}

【模块 G：孩子的学习方式与长期发展倾向】
面对新事物的反应：${newThingReaction}
适应的学习环境：${learningEnvironment}
学习方式：${learningStyle}
发展节奏倾向：${developmentRhythm}
毕业后倾向：${postGradTendency}

【模块 H：报告目标】
报告重点关注：${reportFocus}
最希望解决的一件事：${mostCriticalThing}

===================

请严格按照以下JSON格式返回（所有文字内容必须是中文，字数要求请严格遵守）：

{
  // ===== 模块1：执行摘要（450-550字）=====
  "executiveSummary": "450-550字。三层内容：第一层写家庭当前状态判断（是否适合国际化路径、家长与学生目标是否存在隐性偏差）；第二层写更适合的路径方向（理性布局型/冲刺名校型/稳妥优先型，以及priority国家/地区）；第三层写当前最需要解决的问题（是方向问题、投入问题还是一致性问题）。要有判断力、有框架感、让家长产生'被点醒'的感觉",

  // ===== 模块2：家庭教育目标画像（含图表1：雷达图）=====
  "familyGoalRadar": {
    "rankOriented": "数字0-100，名校导向程度",
    "valueOriented": "数字0-100，性价比导向程度",
    "stabilityOriented": "数字0-100，稳定性导向程度",
    "globalOriented": "数字0-100，国际化导向程度",
    "careerOriented": "数字0-100，就业导向程度",
    "growthOriented": "数字0-100，长期成长导向程度"
  },
  "familyGoalText": "200-250字，写：当前家庭目标最强的2个维度；最容易冲突的1-2个维度；为什么这种组合会影响路径选择",

  // ===== 模块3：学生画像与亲子目标一致性分析（含图表2：一致性分析图）=====
  "studentProfileText": "200-250字，写：当前成长状态；当前自驱程度；当前方向清晰度；当前更适合什么节奏",
  "alignmentRadar": {
    "countryChoice": "数字0-100，国家选择一致度",
    "schoolTier": "数字0-100，学校层级期待一致度",
    "majorDirection": "数字0-100，专业方向一致度",
    "investmentExpect": "数字0-100，投入强度预期一致度",
    "riskPreference": "数字0-100，风险偏好一致度"
  },
  "alignmentText": "300-350字，写：哪些地方一致；哪些地方存在隐性偏差；哪些偏差短期不解决会直接影响后续决策效率",

  // ===== 模块4：国家/地区路径判断（含图表3：国家路径对比图）=====
  "countryPathComparison": [
    {
      "country": "国家/地区名",
      "costScore": "数字0-100，成本压力（越高表示成本越低、性价比越好）",
      "thresholdScore": "数字0-100，申请门槛可达度（越高越容易进入）",
      "stabilityScore": "数字0-100，结果稳定性",
      "developmentScore": "数字0-100，长期发展空间",
      "familyFitScore": "数字0-100，家庭适配度",
      "recommendation": "优先推荐|补充参考|暂不建议",
      "estimatedCost": "预估4年总费用",
      "pros": ["优势点1", "优势点2"],
      "cons": ["注意事项1"]
    }
  ],
  "countryPathText": "400-500字，分三层写：优先路径及原因；补充参考路径及原因；暂不建议优先投入的路径及原因",

  // ===== 模块5：家庭资源投入建议（含图表4：资源配置建议图）=====
  "resourceRadar": {
    "academicInvest": "数字0-100，建议学业/成绩投入优先级",
    "testInvest": "数字0-100，建议标化/语言投入优先级",
    "backgroundInvest": "数字0-100，建议背景提升投入优先级",
    "globalProjectInvest": "数字0-100，建议国际项目投入优先级",
    "longTermPlanInvest": "数字0-100，建议长期规划与咨询投入优先级"
  },
  "resourceText": "300-350字，分三层写：A. 当前最值得投入的方向；B. 当前可以控制投入的方向；C. 当前暂不建议过度投入的方向",
  "budgetMilestones": [{"phase": "阶段", "item": "投入项目", "amount": "建议金额范围", "priority": "high|medium|low"}],

  // ===== 模块6：当前最关键的家庭决策问题 =====
  "keyDecision": {
    "coreQuestion": "当前最关键的决策问题（1句话）",
    "riskIfNotSolved": "100-150字，写：如果不解决这个问题，会发生什么",
    "nextAction": "100-150字，写：下一阶段最合理的家庭动作是什么"
  },

  // ===== 模块7：结语与代金券引导 =====
  "conclusion": "100-150字结语。自然引出后续咨询，提及代金券可用于预约荔智惠专业顾问"
}

`;

      },

    },

    career: {
      systemPrompt: `你是国际顶级生涯规划顾问，整合了职业心理学、人才测评和就业市场分析专业知识。
你的任务是基于学生档案数据，生成一份《Life-Career Strategy人生生涯全规划报告》的完整结构化JSON数据。

核心原则：
1. 这是一份真正的长期发展诊断报告，不是兴趣测试结果汇总
2. 重点关注：能力现状、方向匹配、路径选择、能力缺口、时间规划
3. 判断要基于学生的真实答案，有逻辑支撑，有依据的推断
4. 文字内容要直接、有价值，不要用废话和套话
5. 必须返回有效的JSON对象，不要有任何markdown标记或代码块，直接返回JSON`,

      buildPrompt: (data) => {
        const currentStage = data.currentStage || '未填写';
        const schoolName = data.schoolName || '未填写';
        const schoolType = data.schoolType || '未填写';
        const gradeLevel = data.gradeLevel || '未填写';
        const reportGoal = data.reportGoal || '未填写';
        const learningState = data.learningState || '未填写';
        const strongTaskTypes = Array.isArray(data.strongTaskTypes) ? data.strongTaskTypes.join('、') : (data.strongTaskTypes || '未填写');
        const weakTaskTypes = Array.isArray(data.weakTaskTypes) ? data.weakTaskTypes.join('、') : (data.weakTaskTypes || '未填写');
        const growthState = data.growthState || '未填写';
        const interestFields = Array.isArray(data.interestFields) ? data.interestFields.join('、') : (data.interestFields || '未填写');
        const sustainedFocus = data.sustainedFocus || '未填写';
        const freeTimeChoice = data.freeTimeChoice || '未填写';
        const decisionDriver = data.decisionDriver || '未填写';
        const learningStyle = data.learningStyle || '未填写';
        const studyEnvironmentPref = data.studyEnvironmentPref || '未填写';
        const campusLifePref = data.campusLifePref || '未填写';
        const cityPref = data.cityPref || '未填写';
        const newFieldReaction = data.newFieldReaction || '未填写';
        const postGradDirection = data.postGradDirection || '未填写';
        const phdAttitude = data.phdAttitude || '未填写';
        const futureOutcomes = Array.isArray(data.futureOutcomes) ? data.futureOutcomes.join('、') : (data.futureOutcomes || '未填写');
        const futureSelfImage = data.futureSelfImage || '未填写';
        const expTypes = Array.isArray(data.expTypes) ? data.expTypes.join('、') : (data.expTypes || '未填写');
        const expDetails = [
          data.expResearch ? '【科研】' + data.expResearch : null,
          data.expInternship ? '【实习】' + data.expInternship : null,
          data.expClub ? '【社团】' + data.expClub : null,
          data.expEntrepreneur ? '【创业/项目】' + data.expEntrepreneur : null,
          data.expPortfolio ? '【作品集/成果】' + data.expPortfolio : null,
        ].filter(Boolean).join('\n') || '暂无具体描述';
        const expOverallState = data.expOverallState || '未填写';
        const expFutureDirection = data.expFutureDirection || '未填写';
        const mainLimitation = data.mainLimitation || '未填写';
        const priorityBreakthrough = data.priorityBreakthrough || '未填写';
        const futureWorries = Array.isArray(data.futureWorries) ? data.futureWorries.join('、') : (data.futureWorries || '未填写');
        const reportFocus = Array.isArray(data.reportFocus) ? data.reportFocus.join('、') : (data.reportFocus || '未填写');
        const mostCriticalJudgment = data.mostCriticalJudgment || '未填写';

        return `请基于以下学生档案，生成《Life-Career Strategy人生生涯全规划报告》完整结构化数据：

===== 学生档案 =====

【模块 A：当前阶段与基本背景】
当前所处阶段：${currentStage}
学校名称：${schoolName}
学校类型：${schoolType}
年级/阶段：${gradeLevel}
报告目标：${reportGoal}

【模块 B：当前学习状态与成长基础】
整体学习状态：${learningState}
擅长的任务类型：${strongTaskTypes}
感到吃力的场景：${weakTaskTypes}
当前成长状态：${growthState}

【模块 C：兴趣方向与持续投入倾向】
感兴趣的方向：${interestFields}
能持续投入的事情类型：${sustainedFocus}
自由时间的使用偏好：${freeTimeChoice}
做选择时的驱动因素：${decisionDriver}

【模块 D：学习方式与环境偏好】
学习方式偏好：${learningStyle}
未来学习状态偏好：${studyEnvironmentPref}
学习/生活环境偏好：${campusLifePref}
城市偏好：${cityPref}
面对新领域的反应方式：${newFieldReaction}

【模块 E：未来路径与结果偏好】
毕业后方向偏好：${postGradDirection}
对更高学位的态度：${phdAttitude}
最看重的未来结果：${futureOutcomes}
希望的未来自我状态：${futureSelfImage}

【模块 F：实践经历与方向验证】
已有经历类型：${expTypes}
经历详情：
${expDetails}
经历整体状态：${expOverallState}
未来经历方向偏好：${expFutureDirection}

【模块 G：关键限制与成长阻力】
当前最大限制：${mainLimitation}
未来 1–2 年优先突破：${priorityBreakthrough}
最担心的问题：${futureWorries}

【模块 H：报告目标】
报告重点关注：${reportFocus}
最希望获得的关键判断：${mostCriticalJudgment}

===================

请严格按照以下JSON格式返回（所有文字内容必须是中文，字数要求请严格遵守）：
{
  "growthRadar": {
    "academicPotential": 数字(0-100，学术潜力),
    "practiceOrientation": 数字(0-100，实践导向),
    "analyticalAbility": 数字(0-100，分析能力),
    "communication": 数字(0-100，表达与沟通),
    "leadership": 数字(0-100，领导力倾向),
    "globalMindset": 数字(0-100，国际化发展倾向)
  },
  "abilityTags": [{"tag": "能力标签", "weight": 数字(0-100，权重), "type": "strength|potential|gap"}],
  "longTermSummary": "150-200字长期发展摘要，一句话给出最核心的长期方向判断",
  "growthProfileText": "300-350字，写：当前的优势结构；当前的能力特征；当前的发展状态",
  "interestDirectionText": "350-450字，写：哪些方向更匹配；为什么匹配；哪些方向需要谨慎；当前兴趣和现实条件是否一致",
  "careerPathTree": {
    "currentStage": "当前阶段描述（1句话）",
    "branches": [
      {
        "pathName": "路径名称",
        "fitScore": 数字(0-100),
        "studyPath": "推荐学业路径",
        "majorPath": "推荐专业方向",
        "careerTarget": "最终职业目标",
        "keyMilestones": ["里程碑1", "里程碑2", "里程碑3"]
      }
    ]
  },
  "academicCareerText": "450-550字（核心部分），写：哪类专业更适合；哪类职业方向更顺；为什么会做出这样的判断；哪些方向可以先探索后收敛",
  "capabilityGaps": [
    {"capability": "能力项名称", "currentLevel": 数字(0-100), "requiredLevel": 数字(0-100), "urgency": "high|medium|low", "whyImportant": "50字内为什么重要", "howToImprove": "50字内如何提升"}
  ],
  "capabilityGapText": "350-450字，写：缺什么；为什么重要；不补会带来什么问题；哪些能力对长期竞争力是关键门槛",
  "fiveYearTimeline": [
    {"phase": "当前阶段|1年内|2-3年内|3-5年关键节点", "focus": "阶段核心焦点", "keyActions": ["行动1", "行动2"], "expectedOutcome": "预期成果"}
  ],
  "fiveYearText": "300-400字，按时间轴表达：当前阶段；下一阶段；中长期重点"
  }
`;
      },
    },

  };
  // ---- API Call ----
  async function callQwen(systemPrompt, userPrompt) {
    if (CONFIG.USE_MOCK) {
      // Mock 模式：返回预设的结构化数据
      return generateMockReportData(userPrompt);
    }

    if (backendEnabled()) {
      try {
        const response = await fetch(apiUrl('/api/v1/ai/qwen-json'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {}),
          },
          body: JSON.stringify({
            model: CONFIG.MODEL,
            systemPrompt,
            userPrompt,
          }),
        });
        if (!response.ok) throw new Error(`Backend API error: ${response.status}`);
        const result = await response.json();
        return result.data || result;
      } catch(e) {
        console.error('Backend report API error:', e);
        throw e;
      }
    }

    return generateMockReportData(userPrompt);
  }

  // ---- Mock Report Data Generator ----
  function generateMockReportData(promptHint) {
    // 根据 prompt 内容判断报告类型
    if (promptHint.includes('留学竞争力')) {
      return generateCompetitivenessData();
    } else if (promptHint.includes('家族教育')) {
      return generateFamilyData();
    } else {
      return generateCareerData();
    }
  }

  function generateCompetitivenessData() {
    return {
      overallScore: 73,
      scoringDimensions: {
        academics: 78,
        testScores: 65,
        extracurriculars: 70,
        leadership: 68,
        researchInnovation: 55,
        applicationStrategy: 82,
      },
      summary: "该学生整体申请竞争力处于中高水平，学术基础扎实，具备冲击Top30院校的潜力；但在标化成绩与科研创新维度存在明显缺口，若能在接下来6–12个月内完成针对性补强，申请层级有望显著提升。",
      reachSchools: [
        { name: "University of Michigan, Ann Arbor", country: "美国", qs: "QS #23", matchScore: 68, note: "综合竞争力可冲击，建议搭配强力文书" },
        { name: "University of Toronto", country: "加拿大", qs: "QS #21", matchScore: 72, note: "录取率相对友好，强烈建议列为冲刺" },
        { name: "King's College London", country: "英国", qs: "QS #40", matchScore: 75, note: "UK申请周期较早，需提前备考" },
        { name: "University of Edinburgh", country: "英国", qs: "QS #27", matchScore: 70, note: "苏格兰院校，学费相对合理" },
      ],
      matchSchools: [
        { name: "University of Wisconsin-Madison", country: "美国", qs: "QS #68", matchScore: 84, note: "理工见长，录取匹配度高" },
        { name: "University of Melbourne", country: "澳大利亚", qs: "QS #13", matchScore: 88, note: "全球排名高，录取要求相对灵活" },
        { name: "The University of Hong Kong", country: "中国香港", qs: "QS #17", matchScore: 82, note: "亚太顶校，中英双语优势明显" },
        { name: "University of Glasgow", country: "英国", qs: "QS #78", matchScore: 86, note: "学术声誉佳，生活成本可控" },
        { name: "Lund University", country: "瑞典", qs: "QS #89", matchScore: 80, note: "欧陆名校，国际化氛围浓厚" },
      ],
      alternativePaths: [
        { path: "英国4年本科直申路径", desc: "英国顶校录取逻辑与美国不同，更看重A-Level或IB成绩与专业相关性，文书要求聚焦专业动机。当前背景在英国体系下竞争力高于美国申请市场。" },
        { path: "加拿大+香港双线策略", desc: "以加拿大为主线，搭配香港备选，可有效分散风险，同时保留进入亚太顶校体系的机会。总体性价比在当前背景下较优。" },
        { path: "延迟申请+Gap Year补强方案", desc: "如对当前背景不满意，建议系统性Gap Year：集中提升标化+一段有深度的科研或实习经历，可大幅提升下一轮申请竞争力。" },
      ],
      keyGaps: [
        { level: "critical", title: "标化成绩存在缺口", desc: "SAT/TOEFL成绩尚未达到目标院校中位线，建议作为当前最优先任务强化备考。" },
        { level: "critical", title: "科研与学术创新经历薄弱", desc: "Top30院校越来越看重独立研究能力，目前缺乏可写入申请的学术成果。" },
        { level: "important", title: "领导力经历单薄", desc: "课外活动参与度尚可，但缺乏明显的领导角色或有影响力的结果性成就。" },
        { level: "important", title: "专业方向尚不明确", desc: "明确的专业方向有助于构建更有说服力的申请叙事，当前背景显得过于分散。" },
        { level: "note", title: "文书准备尚需规划", desc: "文书是差异化的核心，建议尽早开始素材梳理与核心故事提炼。" },
      ],
      riskItems: [
        { risk: "申请时间线过于压缩", desc: "若计划明年申请，当前留给补强的时间已相对紧张，需立即启动计划。" },
        { risk: "标化成绩不达线风险", desc: "部分英美顶校对托福/雅思有硬性门槛，未达标可能直接影响录取资格。" },
      ],
      recommendations: [
        { title: "优先完成标化成绩补考", desc: "建议在3个月内完成SAT/托福的集中冲刺，目标SAT 1450+，TOEFL 100+，达到目标院校85分位线。" },
        { title: "启动一段科研项目", desc: "可通过大学暑期项目、在线科研营或联系国内教授，参与真实科研项目，产出可写入文书的成果。" },
        { title: "确定核心专业方向", desc: "建议结合兴趣和能力，在2–3个专业方向中做出主要选择，帮助构建更有逻辑的申请叙事。" },
        { title: "提升活动深度而非广度", desc: "建议选取1–2项核心活动深度投入，产出成果或创立影响力，比分散参与多项活动效果更好。" },
        { title: "尽早启动文书素材库建设", desc: "现在起记录所有有意义的经历，为申请季文书写作积累素材，避免到申请季临时抓瞎。" },
      ],
      targetMajorRisk: [
        { major: "计算机科学（CS）", risk: 88, note: "竞争极为激烈，全球申请者数量庞大，需要极强的技术作品集或竞赛成绩" },
        { major: "经济学", risk: 62, note: "需要优秀GPA和标化，当前背景有竞争力，属中等风险" },
        { major: "工程类（非CS）", risk: 55, note: "竞争相对分散，匹配度较好" },
        { major: "商科/管理", risk: 48, note: "申请逻辑与人文背景更相关，当前背景适配度较高" },
      ],
    };
  }

  function generateFamilyData() {
    return {
      familyProfile: {
        educationGoal: "该家庭的核心诉求是为子女打造具有国际竞争力的学术与职业起点，同时兼顾性价比与长期安全性。家庭决策具备理性规划意识，倾向于在充分信息获取后做出系统性选择。",
        decisionStyle: "理性分析型，重视数据与案例参考",
        resourceLevel: "中高端",
        urgency: "medium",
      },
      studentProfile: {
        growthType: "潜力型学习者——核心能力有待激活",
        potentialScore: 78,
        keyStrengths: ["学习动机较强", "适应力良好", "有初步的自我认知"],
        developmentNeeds: ["学术深度需加强", "职业方向需更清晰", "软实力培养待系统化"],
      },
      parentStudentAlignment: {
        alignmentScore: 72,
        alignedAreas: ["留学意向一致", "对教育投入的整体接受度一致"],
        gapAreas: ["专业选择上家长与学生略有分歧", "时间安排优先级存在差异"],
        suggestion: "建议家长与学生进行一次深度沟通，以学生意愿为主导，家长提供资源支持框架，避免代入式规划导致后期执行阻力。",
      },
      countryPathComparison: [
        {
          country: "美国",
          overallScore: 85,
          fitScore: 82,
          costScore: 48,
          employmentScore: 90,
          pros: ["品牌价值全球最强", "就业市场广阔", "专业选择最多样"],
          cons: ["申请竞争激烈", "总费用最高", "签证政策存在不确定性"],
          estimatedCost: "约 250–350 万人民币（含 4 年本科）",
          recommendation: "推荐",
        },
        {
          country: "英国",
          overallScore: 80,
          fitScore: 78,
          costScore: 65,
          employmentScore: 82,
          pros: ["3 年本科节省时间成本", "欧洲就业市场入口", "学术氛围优秀"],
          cons: ["专业分流早，灵活度低", "毕业后留英政策有限制"],
          estimatedCost: "约 160–220 万人民币（含 3 年本科）",
          recommendation: "强烈推荐",
        },
        {
          country: "加拿大",
          overallScore: 78,
          fitScore: 80,
          costScore: 72,
          employmentScore: 78,
          pros: ["移民通道顺畅", "安全稳定", "录取相对友好"],
          cons: ["就业市场规模有限", "部分专业排名不及美英"],
          estimatedCost: "约 180–250 万人民币（含 4 年本科）",
          recommendation: "强烈推荐",
        },
        {
          country: "新加坡",
          overallScore: 75,
          fitScore: 72,
          costScore: 70,
          employmentScore: 85,
          pros: ["亚太金融中心", "中英双语优势", "顶校录取认可度高"],
          cons: ["申请名额极为有限", "竞争不亚于藤校"],
          estimatedCost: "约 100–150 万人民币（含 4 年本科）",
          recommendation: "可考虑",
        },
        {
          country: "澳大利亚",
          overallScore: 72,
          fitScore: 75,
          costScore: 68,
          employmentScore: 72,
          pros: ["录取要求相对灵活", "生活质量高", "顶校排名优秀"],
          cons: ["就业机会集中于本地市场", "回国认可度参差不齐"],
          estimatedCost: "约 160–220 万人民币（含 3–4 年）",
          recommendation: "推荐",
        },
      ],
      costBenefitAnalysis: {
        shortTermInvestment: "当前阶段建议优先投入：标化备考（3–6 个月集中冲刺）+ 背景提升项目（科研/竞赛/暑校），预估投入 10–20 万元，是回报率最高的阶段性投入。",
        longTermROI: "选择 Top30 名校毕业生，在国内一线城市起薪约 35–60 万/年，海外就业起薪约 8–15 万美元。综合 4 年教育投入，预计 7–10 年内可完成资产回报。",
        keyRisks: ["汇率波动影响海外留学成本", "AI冲击部分传统职业，需选择前景稳定方向", "签证政策变化影响毕业后留学计划"],
        optimizationTips: ["优先申请奖学金，部分目标院校对国际生有专项支持", "选择3年英国/澳洲本科可节省1年时间成本与费用"],
      },
      resourceAllocation: {
        timelineAdvice: "建议按「12–18个月备考+申请窗口」规划，避免边备考边申请的高压状态。",
        budgetAllocation: [
          { phase: "当前阶段", item: "标化备考（SAT/TOEFL）", amount: "3–6万元", priority: "high" },
          { phase: "当前阶段", item: "背景提升（暑校/科研）", amount: "5–15万元", priority: "high" },
          { phase: "申请季", item: "申请辅助服务", amount: "10–30万元", priority: "medium" },
          { phase: "就读阶段", item: "学费+生活费", amount: "40–80万/年", priority: "high" },
        ],
        keyMilestones: [
          { time: "3个月内", action: "确定目标国家与院校名单" },
          { time: "6个月内", action: "完成标化成绩备考" },
          { time: "12个月内", action: "完成背景提升项目" },
          { time: "申请季开始", action: "提交早申/常规申请" },
        ],
      },
      nextSteps: [
        { step: "进行一次专业留学战略咨询", desc: "系统梳理当前背景与目标院校的差距，制定个性化申请策略。建议携带本报告与导师进行深度对话。", urgency: "high" },
        { step: "明确专业方向", desc: "家长与学生共同探讨职业倾向，在2–3个方向中做出初步选择，有助于后续院校筛选。", urgency: "high" },
        { step: "开始标化备考计划", desc: "选择合适的备考方式（自学/辅导班/一对一），设定目标分数线，立即启动。", urgency: "medium" },
      ],
    };
  }

  function generateCareerData() {
    return {
      personalProfile: {
        personalityType: "INTJ / 战略思考者",
        coreIdentity: "该学生具备独立思考能力和强烈的内在驱动力，倾向于深度钻研而非广度扩张。具有天然的系统性思维，适合在复杂问题解决型领域建立竞争优势。",
        learningStyle: "深度学习型——偏好通过理解底层逻辑来掌握知识，而非死记硬背",
        motivationDrivers: ["成就感与自我突破", "知识探索与智识挑战", "对社会或行业的实质性影响"],
      },
      interestAndAbility: {
        interestTags: ["战略分析", "数据驱动决策", "技术创新", "全球化视野"],
        abilityTags: ["逻辑推理", "系统性思考", "信息整合"],
        hollandCode: "IAS",
        coreCompetencies: [
          { name: "分析推理", score: 85, desc: "擅长从复杂信息中提炼核心逻辑" },
          { name: "学术执行力", score: 78, desc: "在有明确目标时展现较强自我管理" },
          { name: "创新思维", score: 72, desc: "有探索新方法的意愿，需要更多实践" },
          { name: "沟通表达", score: 65, desc: "书面表达强于口头，需针对性训练" },
          { name: "领导力", score: 60, desc: "潜力存在，待在正式项目中激活" },
        ],
      },
      academicDirection: {
        recommended: ["数学与统计", "经济学/计量经济", "计算机科学（理论方向）"],
        rationale: "结合分析推理优势与对复杂系统的兴趣，以上方向能最大化学术竞争力并为后续职业发展奠定基础。",
        toAvoid: ["纯记忆型学科（如传统医学基础课）", "高度依赖即兴表达的方向"],
      },
      majorDirection: {
        topMajors: [
          { major: "数据科学 / Applied Math", fitScore: 88, reason: "高度匹配分析能力，市场需求极旺盛", prospectScore: 95 },
          { major: "经济学（含计量方向）", fitScore: 82, reason: "逻辑框架强，与未来政策/金融方向无缝衔接", prospectScore: 85 },
          { major: "计算机科学", fitScore: 78, reason: "技术工具能力是未来任何方向的底层竞争力", prospectScore: 92 },
          { major: "金融工程", fitScore: 75, reason: "适合偏好量化思维并对金融行业有兴趣者", prospectScore: 82 },
        ],
        majorNote: "建议选择可以打通'数理能力+商业思维+技术工具'的复合型专业路径，在高度AI化的就业市场中建立差异化竞争力。",
      },
      careerDirection: {
        primaryCareers: [
          { career: "数据科学家 / 量化分析师", fitScore: 88, marketDemand: "high", futureOutlook: "bright" },
          { career: "战略咨询顾问（麦肯锡/BCG/Bain）", fitScore: 82, marketDemand: "medium", futureOutlook: "stable" },
          { career: "科技公司产品经理（Tech PM）", fitScore: 78, marketDemand: "high", futureOutlook: "bright" },
          { career: "学术研究员 / 大学教授", fitScore: 72, marketDemand: "medium", futureOutlook: "stable" },
        ],
        industryFit: [
          { industry: "科技与互联网", fitScore: 88 },
          { industry: "金融与投资", fitScore: 80 },
          { industry: "咨询与战略", fitScore: 78 },
          { industry: "学术与研究", fitScore: 72 },
          { industry: "政策与公共服务", fitScore: 62 },
        ],
      },
      careerPathTree: {
        currentStage: "高中/大学准备阶段——能力积累与方向探索期",
        branches: [
          {
            pathName: "科技精英路径",
            probability: 42,
            milestones: [
              { year: "Year 1–2", milestone: "完成CS/数学专业基础课，参与编程竞赛或开源项目" },
              { year: "Year 3–4", milestone: "顶级科技公司实习（Google/Microsoft/Bytedance）" },
              { year: "Year 5", milestone: "加入科技公司核心数据/产品团队，或攻读CS硕士" },
              { year: "Year 8–10", milestone: "晋升至高级工程师/技术经理，或创业" },
            ],
            endCareer: "科技公司高管 / 技术创业者",
          },
          {
            pathName: "金融量化路径",
            probability: 32,
            milestones: [
              { year: "Year 1–2", milestone: "打下经济学/数学/统计基础，考取CFA Level 1" },
              { year: "Year 3–4", milestone: "投行或量化对冲基金实习" },
              { year: "Year 5", milestone: "进入投行IBD/量化基金/资产管理机构" },
              { year: "Year 8–10", milestone: "成为Fund Manager或进入私募/VC" },
            ],
            endCareer: "投资经理 / 量化基金合伙人",
          },
          {
            pathName: "战略咨询路径",
            probability: 26,
            milestones: [
              { year: "Year 1–2", milestone: "打好经济学/商科基础，参加案例竞赛" },
              { year: "Year 3–4", milestone: "顶级咨询公司暑期实习" },
              { year: "Year 5", milestone: "加入麦肯锡/BCG/Bain为Analyst/Associate" },
              { year: "Year 8–10", milestone: "晋升Engagement Manager，或转战行业高管" },
            ],
            endCareer: "企业战略高管 / 独立战略顾问",
          },
        ],
      },
      fiveYearTimeline: [
        { year: "Year 1（当前）", focus: "方向确认与能力基础建设", actions: ["确定专业方向", "参加1–2个学术竞赛或暑校", "开始学习编程基础（Python）"], outcome: "形成清晰的大学申请叙事与能力档案" },
        { year: "Year 2", focus: "背景强化与申请准备", actions: ["完成标化备考", "参与科研项目或实习", "完善课外活动体系"], outcome: "申请材料全面就绪，进入申请季" },
        { year: "Year 3（大一）", focus: "大学适应与专业深化", actions: ["完成核心专业课", "加入社团或实验室", "探索第一段正式实习"], outcome: "确立专业方向与职业路径" },
        { year: "Year 4（大二）", focus: "实践与能力验证", actions: ["完成暑期实习", "推进科研或项目", "建立专业人脉"], outcome: "获得可放入简历的实质性成果" },
        { year: "Year 5（大三）", focus: "职业入口攻坚", actions: ["申请头部公司暑期实习（Return Offer通道）", "参加顶级案例竞赛或Hackathon", "决定是否直接就业或读研"], outcome: "拿到顶级公司Offer或研究生录取" },
      ],
      capabilityGaps: [
        { capability: "技术工具能力（编程/数据分析）", currentLevel: 35, requiredLevel: 80, urgency: "high", developmentPlan: "从Python入门开始，通过项目驱动学习，6个月内达到可独立完成数据分析项目的水平" },
        { capability: "口头表达与演讲", currentLevel: 55, requiredLevel: 78, urgency: "medium", developmentPlan: "参加辩论社/公开演讲俱乐部，或申请有presentation要求的暑校" },
        { capability: "领导力与项目管理", currentLevel: 48, requiredLevel: 72, urgency: "medium", developmentPlan: "主动在学校承担组织性角色，或发起一个小型项目并带团队完成" },
        { capability: "英文学术写作", currentLevel: 62, requiredLevel: 85, urgency: "high", developmentPlan: "系统练习学术论文写作格式，争取发表一篇校内期刊或参加写作竞赛" },
      ],
      longTermAdvice: [
        { area: "职业定位", advice: "在AI快速渗透的时代，建议选择'数理基础+领域专业知识'的复合型定位，成为某一领域的AI应用专家，而非被取代的通用型从业者。", timeframe: "5–10年视角" },
        { area: "人脉与资源", advice: "建议有意识地建立顶校同学与行业人脉圈，特别是在读大学阶段积极参与国际交流和暑校，这是高端人脉最经济的获取方式。", timeframe: "大学阶段重点投入" },
        { area: "个人品牌", advice: "建议在大学阶段开始经营自己的专业内容输出（写作/Github/领英），为进入职场时提供额外的差异化竞争力。", timeframe: "从大二开始布局" },
      ],
    };
  }

  // ---- Report Generation ----
  async function generateReport(reportType, questionnaireData) {
    const template = PROMPT_TEMPLATES[reportType];
    if (!template) throw new Error('Unknown report type');

    const userPrompt = template.buildPrompt(questionnaireData);

    // Step 1: Structured data extraction
    let reportData;
    let backendReportId = null;
    const usedBackend = backendEnabled() && state.authToken;
    if (backendEnabled() && !state.authToken) {
      throw new Error('请先登录账户后再生成报告');
    }
    if (usedBackend) {
      try {
        const response = await fetch(apiUrl('/api/v1/reports'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${state.authToken}`,
          },
          body: JSON.stringify({
            reportType,
            questionnaireData,
            model: CONFIG.MODEL,
            systemPrompt: template.systemPrompt,
            userPrompt,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Report API error');
        reportData = result.report.reportData;
        backendReportId = result.report.id;
      } catch(e) {
        console.error('Backend report generation error:', e);
        throw e;
      }
    } else {
      reportData = await callQwen(template.systemPrompt, userPrompt);
    }

    // Step 2: Save report
    const report = {
      id: backendReportId || 'r_' + Date.now(),
      type: reportType,
      typeInfo: REPORT_TYPES[reportType],
      createdAt: new Date().toISOString(),
      questionnaireData,
      reportData,
      status: 'completed',
    };

    state.reports.unshift(report);

    if (usedBackend) {
      saveState();
      return { report, voucher: null };
    }

    // Step 3: Issue voucher
    const voucherAmount = REPORT_TYPES[reportType].voucherAmount;
    const voucher = {
      id: 'v_' + Date.now(),
      code: 'GPN-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      amount: voucherAmount,
      reportId: report.id,
      reportType,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      service: 'Global Study Abroad Strategy Session｜全球留学战略咨询',
    };
    state.vouchers.unshift(voucher);

    saveState();

    return { report, voucher };
  }

  // ---- Service Products ----
  const SERVICES = [
    {
      id: 'consultation',
      name: 'Global Study Abroad Strategy Session',
      nameCN: '全球留学战略咨询',
      featured: true,
      price: 780,
      unit: '元 / 45分钟',
      desc: '面向所有有留学倾向的学生与家庭。可对接藤校招生官顾问、10年以上高端留学申请经验导师、哈佛/斯坦福等名校校友导师、海外名校面试官及长期服务高净值家庭的留学策略顾问。',
      audience: '正在规划留学且需要快速明确方向的学生与家长',
      voucherApplicable: true,
      highlight: ['藤校背景导师', '45分钟深度策略', '路径决策方案'],
    },
    {
      id: 'master',
      name: '硕士申请全包服务',
      nameCN: '国际硕士申请全程服务',
      featured: false,
      price: null,
      unit: '面议',
      desc: '从选校定位、文书规划到最终录取，全程专业团队跟进。覆盖英美加澳顶校，成功案例遍布全球Top50院校。',
      audience: '计划申请海外研究生且希望一对一深度服务的学生',
      voucherApplicable: false,
      highlight: ['全程一对一', '文书深度打磨', 'Top50成功案例'],
    },
    {
      id: 'undergrad',
      name: '本科申请全包服务',
      nameCN: '国际本科申请全程服务',
      featured: false,
      price: null,
      unit: '面议',
      desc: '针对高中生的本科申请全程规划服务。从9–10年级开始系统布局，背景提升+申请辅导+录取追踪，科学规划每一步。',
      audience: '计划申请海外本科且家庭希望系统化规划的高中生',
      voucherApplicable: false,
      highlight: ['9年级起规划', '背景提升策略', '系统申请布局'],
    },
  ];

  // ---- Public API ----
  return {
    CONFIG,
    state,
    REPORT_TYPES,
    LIZHIHUI_PRODUCTS,
    QUESTIONNAIRE_STEPS,
    QUESTIONNAIRE_STEPS_MAP,
    getQuestionnaireSteps,
    SERVICES,
    loadState,
    saveState,
    register,
    login,
    logout,
    isLoggedIn,
    claimLizhihuiVoucher,
    fetchAccountSummary,
    redeemCode,
    sendVerificationCode,
    fetchReport,
    apiRequest,
    generateReport,
  };
})();

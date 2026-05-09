/**
 * Global Pathway Navigator
 * Core Application State & Mock Data Layer
 */

const APP = (() => {
  // ---- Config ----
  const CONFIG = {
    // 阿里云百炼 API Key（国内版）
    DASHSCOPE_API_KEY: 'sk-730b6bde7ae64f81beefbbb9a5bcc6df',
    // 国内版 endpoint
    API_BASE: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    MODEL: 'qwen-plus',
    USE_MOCK: false, // 已配置真实 API Key
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
  };

  // ---- LocalStorage helpers ----
  function saveState() {
    try {
      localStorage.setItem('gpn_user', JSON.stringify(state.user));
      localStorage.setItem('gpn_reports', JSON.stringify(state.reports));
      localStorage.setItem('gpn_vouchers', JSON.stringify(state.vouchers));
    } catch(e) {}
  }

  function loadState() {
    try {
      const u = localStorage.getItem('gpn_user');
      const r = localStorage.getItem('gpn_reports');
      const v = localStorage.getItem('gpn_vouchers');
      if (u) state.user = JSON.parse(u);
      if (r) state.reports = JSON.parse(r);
      if (v) state.vouchers = JSON.parse(v);
    } catch(e) {}
  }

  // ---- Mock accounts (pre-seeded) ----
  function getUsers() {
    const stored = localStorage.getItem('gpn_users');
    if (stored) return JSON.parse(stored);
    return [];
  }
  function saveUsers(users) {
    localStorage.setItem('gpn_users', JSON.stringify(users));
  }

  // ---- Auth ----
  function register(name, email, password, phone) {
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

  function login(email, password) {
    const users = getUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) return { ok: false, msg: '邮箱或密码错误，请重试' };
    state.user = { ...user };
    delete state.user.password;
    saveState();
    return { ok: true };
  }

  function logout() {
    state.user = null;
    saveState();
  }

  function isLoggedIn() {
    return !!state.user;
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
      {
        id: 'r_foundation',
        title: '模块 A：当前发展基础',
        desc: '请如实描述当前的学业情况与能力状态，系统将以此建立你的成长画像基础。',
        insight: '当前能力基础是生涯规划的起点，真实的自我评估比美化的答案更有价值。',
        fields: [
          { id: 'currentStage', label: '当前所处阶段', type: 'radio', required: true, options: ['初中', '高中', '本科大一/大二', '本科大三/大四', '研究生', '工作中'] },
          { id: 'schoolMajor', label: '当前学校/专业/课程方向', type: 'text', placeholder: '例：上海某国际高中，修IB课程，偏理科；或北京大学经济学大二学生' },
          { id: 'academicLevel', label: '当前学业表现', type: 'radio', options: ['非常优秀', '良好', '中等', '偏弱', '暂不确定'] },
          { id: 'topStrengths', label: '当前最强的 2–3 个能力是什么（请开放填写）', type: 'textarea', placeholder: '例：逻辑分析能力很强，擅长发现问题中的规律；英语表达流利，演讲比较自信；数学思维好，解题速度快' },
          { id: 'topWeakness', label: '当前最弱的 1–2 个能力是什么（请开放填写）', type: 'textarea', placeholder: '例：执行力不够，很多事情有想法但落实不好；时间管理比较差' },
        ],
      },
      {
        id: 'r_interest',
        title: '模块 B：兴趣与方向',
        desc: '请真实描述自己对哪些领域感兴趣，以及为什么，系统将据此判断方向匹配度。',
        insight: '兴趣的真实程度与具体程度，将直接影响方向判断的准确性。',
        fields: [
          { id: 'interestFields', label: '最感兴趣的方向（最多选3）', type: 'checkbox', options: ['商业/金融', '科技/工程', '数据/AI', '医学/生命科学', '社会科学/公共政策', '法律', '传媒/内容', '创意/设计', '教育/心理', '暂不确定'] },
          { id: 'interestReason', label: '为什么对这些方向感兴趣（请开放填写）', type: 'textarea', placeholder: '例：从小对数字和模型很敏感，看到商业案例会忍不住分析背后的逻辑；或者因为参加了学校的辩论队，发现自己很享受说服别人的过程…' },
          { id: 'triedRelated', label: '目前是否已经尝试过相关课程/项目/活动', type: 'radio', options: ['有，且比较深入', '有一些尝试', '几乎没有', '不确定'] },
        ],
      },
      {
        id: 'r_ability',
        title: '模块 C：能力与工作方式偏好',
        desc: '请选择最符合自己实际情况的选项，帮助系统判断你最适合什么类型的工作环境。',
        insight: '工作方式偏好与能力结构的匹配程度，是判断职业方向的核心依据之一。',
        fields: [
          { id: 'goodAt', label: '你更擅长哪类事情（最多选3）', type: 'checkbox', options: ['分析问题', '沟通表达', '组织协调', '执行落地', '创新创意', '研究与深度思考', '领导与带动他人', '解决复杂问题'] },
          { id: 'workStyle', label: '你更喜欢哪种工作方式', type: 'radio', options: ['独立深度思考', '团队协作推进', '结构化分析与研究', '快节奏执行与结果导向', '创意表达与内容输出', '带领团队与做决策'] },
          { id: 'workValues', label: '你希望未来的工作更偏向', type: 'radio', options: ['高收入回报', '稳定与确定性', '兴趣和热爱', '国际化机会', '社会影响力', '长期成长空间'] },
        ],
      },
      {
        id: 'r_career',
        title: '模块 D：职业想象与路径认知',
        desc: '请描述你对未来职业的想象，以及希望系统重点帮你判断什么。',
        insight: '职业认知的清晰程度是系统判断路径成熟度的重要维度。',
        fields: [
          { id: 'careerTarget', label: '目前最感兴趣的职业方向（可开放填写）', type: 'text', placeholder: '例：数据科学家、咨询顾问、产品经理、学者、创业者等' },
          { id: 'careerReason', label: '你为什么会考虑这些职业方向（请开放填写）', type: 'textarea', placeholder: '例：因为喜欢解决有复杂度的问题，觉得咨询工作可以快速接触很多行业；或对AI技术很着迷，希望能做实际改变产品的工作…' },
          { id: 'futureClarity', label: '你对未来 3–5 年是否有大致想法', type: 'radio', options: ['很明确', '有模糊方向', '比较不清楚', '完全不确定'] },
          { id: 'helpNeeded', label: '你更希望系统帮你判断什么（最多选2）', type: 'checkbox', options: ['更适合什么专业', '更适合什么职业方向', '应该补什么能力', '未来时间怎么规划', '哪条长期路径更适合'] },
        ],
      },
      {
        id: 'r_constraints',
        title: '模块 E：现实约束与发展条件',
        desc: '请如实填写当前面临的主要限制，系统将据此生成最贴近实际的发展建议。',
        insight: '承认限制不是缺点，而是做出正确规划决策的前提。',
        fields: [
          { id: 'mainLimits', label: '你目前最大的现实限制是什么（多选）', type: 'checkbox', options: ['学术成绩', '缺少实践经历', '缺少方向感', '资源有限', '家长期待压力', '对未来信息不清晰', '时间不够'] },
          { id: 'willImprove', label: '你愿意为了长期目标优先补什么（最多选2）', type: 'checkbox', options: ['学术能力', '沟通表达', '实践与项目', '领导力', '行业认知', '国际化能力', '职业探索'] },
          { id: 'parentExpect', label: '家长对你未来的期待更偏向哪种结果', type: 'radio', options: ['稳定', '高回报', '名校背景', '体面职业', '兴趣与热爱', '国际化发展', '暂不明确'] },
        ],
      },
      {
        id: 'r_longterm',
        title: '模块 F：长期目标与个人判断',
        desc: '这是最重要的一个模块。请尽量真实地表达你对自己的认识和对未来的想象。',
        insight: '对自己的深度认知，是系统生成高价值生涯判断的最核心输入。',
        fields: [
          { id: 'futureSelf', label: '你认为自己未来最可能成为什么样的人（请开放填写）', type: 'textarea', placeholder: '可以是一个具体的人物画像、一种生活状态、或者一种社会角色。不需要"正确答案"，越真实越好…' },
          { id: 'futureWorries', label: '你最担心未来发展的什么问题（请开放填写）', type: 'textarea', placeholder: '例：担心自己没有明确方向一直在迷茫、担心找不到真正喜欢又有钱途的工作、担心和别人比起来竞争力太弱…' },
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

  };

//     family: {
//       systemPrompt: `你是高端家庭教育战略顾问，专注于为高净值家庭提供全周期国际化教育路径规划。
// 你的任务是基于家庭档案数据，生成一份《NextGen家族教育战略智能报告》的完整结构化JSON数据。
// 
// 核心原则：
// 1. 这是一份家庭决策报告，不是学生申请报告
// 2. 重点关注：最优路径选择、钱和时间怎么投、亲子目标对齐
// 3. 语言风格：理性、专业、有据可依，避免空洞建议
// 4. 每一节文字内容要有实质信息量，字数要求严格遵守
// 5. 必须返回有效的JSON对象，不要有任何markdown标记或代码块，直接返回JSON`,
// 
//       buildPrompt: (data) => {
//         const mainProblem = data.mainProblem || '未填写';
//         const childStage = data.childStage || '未填写';
//         const schoolTypeF = data.schoolTypeF || '未填写';
//         const intlPathDecision = data.intlPathDecision || '未填写';
//         const applyTiming = data.applyTiming || '未填写';
//         const academicPerformance = data.academicPerformance || '未填写';
//         const childStrengths = Array.isArray(data.childStrengths) ? data.childStrengths.join('、') : (data.childStrengths || '未填写');
//         const childWeaknesses = Array.isArray(data.childWeaknesses) ? data.childWeaknesses.join('、') : (data.childWeaknesses || '未填写');
//         const directionClarity = data.directionClarity || '未填写';
//         const childState = data.childState || '未填写';
//         const familyValues = Array.isArray(data.familyValues) ? data.familyValues.join('、') : (data.familyValues || '未填写');
//         const firstPriority = data.firstPriority || '未填写';
//         const hopeChildBecome = data.hopeChildBecome || '未填写';
//         const educationRole = data.educationRole || '未填写';
//         const preferCountries = Array.isArray(data.preferCountries) ? data.preferCountries.join('、') : (data.preferCountries || '未填写');
//         const countryPreferenceReason = Array.isArray(data.countryPreferenceReason) ? data.countryPreferenceReason.join('、') : (data.countryPreferenceReason || '未填写');
//         const preferredEnvironment = data.preferredEnvironment || '未填写';
//         const pathRhythm = data.pathRhythm || '未填写';
//         const budgetAttitude = data.budgetAttitude || '未填写';
//         const investFocus = Array.isArray(data.investFocus) ? data.investFocus.join('、') : (data.investFocus || '未填写');
//         const familyWorries = Array.isArray(data.familyWorries) ? data.familyWorries.join('、') : (data.familyWorries || '未填写');
//         const earlyPlanningAttitude = data.earlyPlanningAttitude || '未填写';
//         const parentChildAlignment = data.parentChildAlignment || '未填写';
//         const gapAreas = Array.isArray(data.gapAreas) ? data.gapAreas.join('、') : (data.gapAreas || '未填写');
//         const hardestDecision = data.hardestDecision || '未填写';
//         const hopeSystemDecide = data.hopeSystemDecide || '未填写';
//         const newThingReaction = data.newThingReaction || '未填写';
//         const learningEnvironment = data.learningEnvironment || '未填写';
//         const learningStyle = data.learningStyle || '未填写';
//         const developmentRhythm = data.developmentRhythm || '未填写';
//         const postGradTendency = data.postGradTendency || '未填写';
//         const reportFocus = Array.isArray(data.reportFocus) ? data.reportFocus.join('、') : (data.reportFocus || '未填写');
//         const mostCriticalThing = data.mostCriticalThing || '未填写';
// 
//         return `请基于以下家庭档案，生成《NextGen家族教育战略智能报告》完整结构化数据：
// 
// ===== 家庭档案 =====
// 
// 【模块 A：家庭当前所处阶段】
// 当前最想解决的问题：${mainProblem}
// 孩子当前所处阶段：${childStage}
// 孩子当前学校类型：${schoolTypeF}
// 国际化路径判断：${intlPathDecision}
// 计划进入申请阶段的时间：${applyTiming}
// 
// 【模块 B：孩子当前的基础状态】
// 整体学业表现：${academicPerformance}
// 孩子主要优势：${childStrengths}
// 孩子主要短板：${childWeaknesses}
// 对未来方向清晰度：${directionClarity}
// 孩子当前发展状态：${childState}
// 
// 【模块 C：家庭教育目标与价值排序】
// 家庭最看重什么：${familyValues}
// 第一优先级：${firstPriority}
// 希望孩子成为哪类人：${hopeChildBecome}
// 教育最重要的作用：${educationRole}
// 
// 【模块 D：国家/地区与路径偏好】
// 优先考虑的国家/地区：${preferCountries}
// 偏好来源：${countryPreferenceReason}
// 偏好的生活/学习环境：${preferredEnvironment}
// 可接受的路径节奏：${pathRhythm}
// 
// 【模块 E：家庭投入方式与预算观】
// 教育投入态度：${budgetAttitude}
// 愿意优先投入的方向：${investFocus}
// 家庭主要担忧：${familyWorries}
// 对早规划的态度：${earlyPlanningAttitude}
// 
// 【模块 F：亲子目标一致性与决策矛盾】
// 亲子目标一致情况：${parentChildAlignment}
// 分歧类型（如有）：${gapAreas}
// 最难做的决策：${hardestDecision}
// 希望系统帮助做哪类决定：${hopeSystemDecide}
// 
// 【模块 G：孩子的学习方式与长期发展倾向】
// 面对新事物的反应：${newThingReaction}
// 适应的学习环境：${learningEnvironment}
// 学习方式：${learningStyle}
// 发展节奏倾向：${developmentRhythm}
// 毕业后倾向：${postGradTendency}
// 
// 【模块 H：报告目标】
// 报告重点关注：${reportFocus}
// 最希望解决的一件事：${mostCriticalThing}
// 
// ===================
// 
// 请严格按照以下JSON格式返回（所有文字内容必须是中文，字数要求请严格遵守）：
// （所有文字内容必须是中文，字数要求请严格遵守）：
// {
//   "familyGoalRadar": {
//     "rankOriented": 数字(0-100，名校导向程度),
//     "valueOriented": 数字(0-100，性价比导向程度),
//     "stabilityOriented": 数字(0-100，稳定性导向程度),
//     "globalOriented": 数字(0-100，国际化导向程度),
//     "careerOriented": 数字(0-100，就业导向程度),
//     "growthOriented": 数字(0-100，长期成长导向程度)
//   },
//   "familySummary": "150-200字家庭战略摘要，一句话概括最适合这类家庭的国际化路径",
//   "decisionStateAnalysis": "300-350字，写：家庭目前处于什么判断阶段；决策核心矛盾是什么；当前最大的盲区是什么",
//   "studentFamilyAlignment": {
//     "alignmentRadar": {
//       "countryChoice": 数字(0-100，国家选择一致度),
//       "schoolTier": 数字(0-100，学校层级一致度),
//       "majorDirection": 数字(0-100，专业方向一致度),
//       "investmentExpect": 数字(0-100，投入预期一致度),
//       "riskPreference": 数字(0-100，风险偏好一致度)
//     },
//     "alignmentText": "350-450字，写：学生特点；家长期待；匹配点；偏差点；哪些偏差需要尽快统一"
//   },
//   "countryPathComparison": [
//     {
//       "country": "国家名",
//       "costScore": 数字(0-100，性价比，越高性价比越好),
//       "thresholdScore": 数字(0-100，门槛可达度，越高越容易进入),
//       "stabilityScore": 数字(0-100，结果稳定性),
//       "globalScore": 数字(0-100，国际化程度),
//       "careerScore": 数字(0-100，职业连接度),
//       "recommendation": "强烈推荐|推荐|可考虑|不建议",
//       "estimatedCost": "预估4年总费用",
//       "pros": ["优势1", "优势2"],
//       "cons": ["劣势1"]
//     }
//   ],
//   "countryPathText": "450-550字，写：哪些国家更适合；哪些路径不建议盲目投入；成本、结果、稳定性如何比较；哪些路径更符合当前家庭画像",
//   "resourceAllocation": {
//     "radarData": {
//       "academicInvest": 数字(0-100，建议学业投入优先级),
//       "testInvest": 数字(0-100，建议标化投入优先级),
//       "backgroundInvest": 数字(0-100，建议背景提升投入优先级),
//       "globalProjectInvest": 数字(0-100，建议国际项目投入优先级),
//       "longTermPlanInvest": 数字(0-100，建议长期规划投入优先级)
//     },
//     "allocationText": "350-450字，写：钱应该优先投向哪里；时间应该优先放在哪里；哪些投入性价比低；哪些投入会直接影响结果",
//     "budgetMilestones": [{"phase": "阶段", "item": "投入项目", "amount": "建议金额范围", "priority": "high|medium|low"}]
//   },
//   "conclusion": "100-150字决策建议结语，自然引出荔智惠专业顾问咨询，提及代金券可用"
//   },
// 
//     career: {
//       systemPrompt: `你是国际顶级生涯规划顾问，整合了职业心理学、人才测评和就业市场分析专业知识。
// 你的任务是基于学生档案数据，生成一份《Life-Career Strategy人生生涯全规划报告》的完整结构化JSON数据。
// 
// 核心原则：
// 1. 这是一份真正的长期发展诊断报告，不是兴趣测试结果汇总
// 2. 重点关注：能力现状、方向匹配、路径选择、能力缺口、时间规划
// 3. 判断要基于学生的真实答案，有逻辑支撑，有依据的推断
// 4. 文字内容要直接、有价值，不要用废话和套话
// 5. 必须返回有效的JSON对象，不要有任何markdown标记或代码块，直接返回JSON`,
// 
//       buildPrompt: (data) => `请基于以下学生档案，生成《Life-Career Strategy人生生涯全规划报告》完整结构化数据：
// 
// 学生档案：
// ${JSON.stringify(data, null, 2)}
// 
// 请严格按照以下JSON格式返回（所有文字内容必须是中文，字数要求请严格遵守）：
// {
//   "growthRadar": {
//     "academicPotential": 数字(0-100，学术潜力),
//     "practiceOrientation": 数字(0-100，实践导向),
//     "analyticalAbility": 数字(0-100，分析能力),
//     "communication": 数字(0-100，表达与沟通),
//     "leadership": 数字(0-100，领导力倾向),
//     "globalMindset": 数字(0-100，国际化发展倾向)
//   },
//   "abilityTags": [{"tag": "能力标签", "weight": 数字(0-100，权重), "type": "strength|potential|gap"}],
//   "longTermSummary": "150-200字长期发展摘要，一句话给出最核心的长期方向判断",
//   "growthProfileText": "300-350字，写：当前的优势结构；当前的能力特征；当前的发展状态",
//   "interestDirectionText": "350-450字，写：哪些方向更匹配；为什么匹配；哪些方向需要谨慎；当前兴趣和现实条件是否一致",
//   "careerPathTree": {
//     "currentStage": "当前阶段描述（1句话）",
//     "branches": [
//       {
//         "pathName": "路径名称",
//         "fitScore": 数字(0-100),
//         "studyPath": "推荐学业路径",
//         "majorPath": "推荐专业方向",
//         "careerTarget": "最终职业目标",
//         "keyMilestones": ["里程碑1", "里程碑2", "里程碑3"]
//       }
//     ]
//   },
//   "academicCareerText": "450-550字（核心部分），写：哪类专业更适合；哪类职业方向更顺；为什么会做出这样的判断；哪些方向可以先探索后收敛",
//   "capabilityGaps": [
//     {"capability": "能力项名称", "currentLevel": 数字(0-100), "requiredLevel": 数字(0-100), "urgency": "high|medium|low", "whyImportant": "50字内为什么重要", "howToImprove": "50字内如何提升"}
//   ],
//   "capabilityGapText": "350-450字，写：缺什么；为什么重要；不补会带来什么问题；哪些能力对长期竞争力是关键门槛",
//   "fiveYearTimeline": [
//     {"phase": "当前阶段|1年内|2-3年内|3-5年关键节点", "focus": "阶段核心焦点", "keyActions": ["行动1", "行动2"], "expectedOutcome": "预期成果"}
//   ],
//   "fiveYearText": "300-400字，按时间轴表达：当前阶段；下一阶段；中长期重点"
// }`,
//     },
//   };

  // ---- API Call ----
  async function callQwen(systemPrompt, userPrompt) {
    if (CONFIG.USE_MOCK || !CONFIG.DASHSCOPE_API_KEY) {
      // Mock 模式：返回预设的结构化数据
      return generateMockReportData(userPrompt);
    }

    try {
      const response = await fetch(`${CONFIG.API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.DASHSCOPE_API_KEY}`,
        },
        body: JSON.stringify({
          model: CONFIG.MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();
      const content = result.choices[0].message.content;
      return JSON.parse(content);
    } catch(e) {
      console.error('Qwen API error:', e);
      return generateMockReportData(userPrompt);
    }
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
    const reportData = await callQwen(template.systemPrompt, userPrompt);

    // Step 2: Save report
    const report = {
      id: 'r_' + Date.now(),
      type: reportType,
      typeInfo: REPORT_TYPES[reportType],
      createdAt: new Date().toISOString(),
      questionnaireData,
      reportData,
      status: 'completed',
    };

    state.reports.unshift(report);

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
    generateReport,
  };
})();

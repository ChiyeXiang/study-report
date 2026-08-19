window.GPN_CONFIG = {
  BACKEND_API_BASE: '/ai-report-api',
  USE_MOCK: false
};

(function installGenericReportFallback() {
  function scheduleReportFallback(pageId, params) {
    if (pageId !== 'report' || !params || !params.reportId) return;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      const body = document.getElementById('reportBody');
      if (!body) return;
      if (body.innerHTML.trim() && !looksLikeEmptyCareerReport(body)) {
        clearInterval(timer);
        return;
      }
      try {
        let report = (window.APP?.state?.reports || []).find(r => r.id === params.reportId);
        if ((!report || !report.reportData) && window.APP?.fetchReport) {
          report = await window.APP.fetchReport(params.reportId);
        }
        if (report?.reportData) {
          body.innerHTML = buildGenericReportHtml(report.reportData, report);
          clearInterval(timer);
        }
      } catch (err) {
        if (attempts >= 8) clearInterval(timer);
      }
      if (attempts >= 8) clearInterval(timer);
    }, 500);
  }

  function looksLikeEmptyCareerReport(body) {
    const title = document.getElementById('reportTitle')?.textContent || '';
    if (!title.includes('Life-Career')) return false;
    const text = body.textContent.replace(/\s+/g, '');
    const emptyLabels = [
      '长期发展摘要',
      'AI核心判断',
      '个人成长画像',
      '兴趣方向与能力标签',
      '能力权重图',
      '学业与职业路径建议',
      '当前能力缺口',
      '未来3–5年成长建议'
    ];
    const hasOnlyLabels = emptyLabels.some(label => text.includes(label)) && text.length < 90;
    const hasNoSummaryText = !body.querySelector('.report-summary-text')?.textContent.trim();
    return hasOnlyLabels && hasNoSummaryText;
  }

  function buildGenericReportHtml(data, report) {
    const summary = firstText([data.executiveSummary, data.longTermSummary, data.reportSummary, data.summary, data.conclusion]);
    const sections = Array.isArray(data.sections) ? data.sections : [];
    const recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
    const risks = Array.isArray(data.risks) ? data.risks : [];
    const nextSteps = Array.isArray(data.nextSteps) ? data.nextSteps : [];
    const blocks = [];

    if (summary) {
      blocks.push(`
        <div class="report-section">
          <div class="report-section-header">
            <div class="report-section-icon" style="background:#e8f0f9">📋</div>
            <div class="report-section-title">报告摘要</div>
          </div>
          <div class="report-summary-box">
            <div class="report-summary-label">AI 核心判断</div>
            <div class="report-summary-text">${formatText(summary)}</div>
          </div>
        </div>
      `);
    }

    if (sections.length) {
      blocks.push(`
        <div class="report-section">
          <div class="report-section-header">
            <div class="report-section-icon" style="background:#fef9ee">🧭</div>
            <div class="report-section-title">${report.typeInfo?.name || '报告分析'}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px">
            ${sections.map((section, index) => {
              const title = section?.title || section?.name || `分析模块 ${index + 1}`;
              const content = firstText([section?.content, section?.description, section?.summary, section?.text]);
              const bullets = toArray(section?.items || section?.bullets || section?.points);
              return `
                <div style="padding:16px;background:var(--gray-50);border-radius:var(--radius-lg)">
                  <div style="font-size:15px;font-weight:700;color:var(--gray-800);margin-bottom:8px">${title}</div>
                  ${content ? `<div style="font-size:14px;color:var(--gray-600);line-height:1.85">${formatText(content)}</div>` : ''}
                  ${bullets.length ? `<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">${bullets.map(item => `<div style="font-size:13px;color:var(--gray-600);line-height:1.7">• ${formatText(textFromItem(item))}</div>`).join('')}</div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `);
    }

    if (recommendations.length || nextSteps.length) {
      blocks.push(`
        <div class="report-section">
          <div class="report-section-header">
            <div class="report-section-icon" style="background:#ecfdf5">✅</div>
            <div class="report-section-title">推荐补强方向</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${recommendations.concat(nextSteps).map((item, index) => `
              <div style="display:flex;gap:14px;padding:14px 16px;background:var(--gray-50);border-radius:var(--radius-lg)">
                <div style="width:26px;height:26px;border-radius:50%;background:var(--navy-500);color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${index + 1}</div>
                <div style="font-size:14px;color:var(--gray-700);line-height:1.75">${formatText(textFromItem(item))}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `);
    }

    if (risks.length) {
      blocks.push(`
        <div class="report-section">
          <div class="report-section-header">
            <div class="report-section-icon" style="background:#fef2f2">⚠️</div>
            <div class="report-section-title">当前核心短板与风险</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${risks.map(item => `<div style="padding:14px 16px;background:var(--gray-50);border-radius:var(--radius-lg);border-left:3px solid var(--warning)">${formatText(textFromItem(item))}</div>`).join('')}
          </div>
        </div>
      `);
    }

    return blocks.length ? blocks.join('') : `
      <div class="report-section">
        <div class="report-section-header">
          <div class="report-section-icon" style="background:#fef2f2">⚠️</div>
          <div class="report-section-title">报告内容未完整展示</div>
        </div>
        <div style="font-size:14px;color:var(--gray-600);line-height:1.85">报告已经生成，但模型返回的结构化字段暂时无法被当前页面识别。请重新生成一次，或联系技术支持检查该报告的原始返回内容。</div>
      </div>
    `;
  }

  function firstText(values) {
    return values.find(value => typeof value === 'string' && value.trim());
  }

  function toArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) return [value];
    return [];
  }

  function textFromItem(item) {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return '';
    return firstText([
      item.title && item.description ? `${item.title}：${item.description}` : '',
      item.title && item.content ? `${item.title}：${item.content}` : '',
      item.action && item.expectedImpact ? `${item.action}：${item.expectedImpact}` : '',
      item.step,
      item.action,
      item.recommendation,
      item.description,
      item.content,
      item.text,
      item.name
    ]) || '';
  }

  function formatText(text) {
    return String(text || '').replace(/\n/g, '<br>');
  }

  function install() {
    if (!window.UI || window.UI.__genericReportFallbackInstalled) return false;
    const originalShowPage = window.UI.showPage.bind(window.UI);
    window.UI.showPage = function patchedShowPage(pageId, params = {}) {
      const result = originalShowPage(pageId, params);
      scheduleReportFallback(pageId, params);
      return result;
    };
    window.UI.__genericReportFallbackInstalled = true;
    return true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 20) clearInterval(timer);
    }, 100);
  });
})();

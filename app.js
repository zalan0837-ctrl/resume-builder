/**
 * ===========================
 * 简历生成器 - 核心逻辑
 * ===========================
 * 
 * 功能：
 * 1. 表单编辑 + 实时预览
 * 2. 拖拽排序模块
 * 3. 照片上传
 * 4. 自动保存到 localStorage
 * 5. 导出 Word 文件
 */

(function () {
  'use strict';

  // =====================
  // 常量与配置
  // =====================
  const STORAGE_KEY = 'resume_builder_data';
  // AI 设置已内置，不再需要 localStorage key

  // 模块显示名称映射
  const MODULE_NAMES = {
    education: '🎓 教育背景',
    experience: '💼 工作经历',
    projects: '🚀 项目经历',
    skills: '🛠 专业技能',
    summary: '✨ 自我评价',
    awards: '🏆 荣誉证书'
  };

  // =====================
  // 默认数据
  // =====================
  function getDefaultData() {
    return {
      // 个人信息
      profile: {
        name: '',
        jobTitle: '',
        phone: '',
        email: '',
        city: '',
        birthday: '',
        website: '',
        photo: '' // base64
      },
      // 模块顺序（不包含 profile，profile 固定在最前面）
      moduleOrder: ['education', 'experience', 'projects', 'skills', 'summary', 'awards'],
      // 已删除的模块
      deletedModules: [],
      // 教育背景条目
      education: [
        { school: '', major: '', degree: '', startDate: '', endDate: '', desc: '' }
      ],
      // 工作经历条目
      experience: [
        { company: '', position: '', startDate: '', endDate: '', desc: '' }
      ],
      // 项目经历条目
      projects: [
        { projectName: '', role: '', startDate: '', endDate: '', desc: '' }
      ],
      // 技能文本
      skillsContent: '',
      // 自我评价文本
      summaryContent: '',
      // 荣誉证书文本
      awardsContent: ''
    };
  }

  // =====================
  // 全局状态
  // =====================
  let resumeData = getDefaultData();
  let saveTimer = null;

  // AI 设置（内置配置，无需前端手动设置）
  const aiSettings = {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: '51270b3636514f9190d2bb92a208ccdd.eR0Bp53sPlo5afJf',
    model: 'glm-4-flash'
  };
  // 当前正在进行AI优化的目标textarea信息
  let currentAITarget = null;

  // =====================
  // DOM 引用
  // =====================
  const moduleList = document.getElementById('module-list');
  const resumePreview = document.getElementById('resume-preview');
  const photoInput = document.getElementById('photo-input');
  const photoPreview = document.getElementById('photo-preview');
  const btnRemovePhoto = document.getElementById('btn-remove-photo');
  const btnExport = document.getElementById('btn-export');
  const btnReset = document.getElementById('btn-reset');
  const saveToast = document.getElementById('save-toast');
  const deletedModulesContainer = document.getElementById('deleted-modules');
  const deletedModulesList = document.getElementById('deleted-modules-list');

  // AI 相关 DOM
  const aiResultModal = document.getElementById('ai-result-modal');
  const aiLoading = document.getElementById('ai-loading');
  const aiResultContent = document.getElementById('ai-result-content');
  const aiResultFooter = document.getElementById('ai-result-footer');
  const aiOriginalText = document.getElementById('ai-original-text');
  const aiOptimizedText = document.getElementById('ai-optimized-text');
  const aiError = document.getElementById('ai-error');

  // =====================
  // 初始化
  // =====================
  function init() {
    loadFromStorage();
    renderAllItems();
    bindEvents();
    bindAIEvents();
    initSortable();
    updatePreview();
    restoreModuleOrder();
    restoreDeletedModules();
    restoreFormValues();
    updatePhotoUI();
  }

  // =====================
  // 本地存储
  // =====================

  /** 从 localStorage 加载数据 */
  function loadFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        resumeData = { ...getDefaultData(), ...parsed };
      }
    } catch (e) {
      console.warn('加载本地数据失败:', e);
    }
  }

  /** 保存到 localStorage（防抖） */
  function saveToStorage() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(resumeData));
        showSaveToast();
      } catch (e) {
        console.warn('保存数据失败:', e);
      }
    }, 500);
  }

  /** 显示保存提示 */
  function showSaveToast() {
    saveToast.classList.add('show');
    setTimeout(() => saveToast.classList.remove('show'), 1500);
  }

  // =====================
  // 恢复表单数据
  // =====================

  /** 恢复个人信息表单值 */
  function restoreFormValues() {
    // 个人信息
    const profileModule = document.querySelector('[data-module="profile"]');
    if (profileModule) {
      Object.keys(resumeData.profile).forEach(key => {
        if (key === 'photo') return;
        const input = profileModule.querySelector(`[data-field="${key}"]`);
        if (input) input.value = resumeData.profile[key] || '';
      });
    }

    // 技能
    const skillsField = document.querySelector('[data-field="skillsContent"]');
    if (skillsField) skillsField.value = resumeData.skillsContent || '';

    // 自我评价
    const summaryField = document.querySelector('[data-field="summaryContent"]');
    if (summaryField) summaryField.value = resumeData.summaryContent || '';

    // 荣誉证书
    const awardsField = document.querySelector('[data-field="awardsContent"]');
    if (awardsField) awardsField.value = resumeData.awardsContent || '';
  }

  // =====================
  // 照片上传
  // =====================

  function updatePhotoUI() {
    if (resumeData.profile.photo) {
      photoPreview.innerHTML = `<img src="${resumeData.profile.photo}" alt="照片">`;
      btnRemovePhoto.style.display = 'inline-block';
    } else {
      photoPreview.innerHTML = '<span class="photo-placeholder">点击上传照片</span>';
      btnRemovePhoto.style.display = 'none';
    }
  }

  function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件');
      return;
    }
    // 限制文件大小 2MB
    if (file.size > 2 * 1024 * 1024) {
      alert('图片大小不能超过 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      resumeData.profile.photo = ev.target.result;
      updatePhotoUI();
      updatePreview();
      saveToStorage();
    };
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    resumeData.profile.photo = '';
    photoInput.value = '';
    updatePhotoUI();
    updatePreview();
    saveToStorage();
  }

  // =====================
  // 多条目渲染（教育/工作/项目）
  // =====================

  /** 为指定类型渲染条目列表 */
  function renderItems(type) {
    const container = document.querySelector(`[data-items="${type}"]`);
    if (!container) return;
    const items = resumeData[type] || [];
    container.innerHTML = '';

    items.forEach((item, index) => {
      const entry = document.createElement('div');
      entry.className = 'item-entry';
      entry.innerHTML = getItemHTML(type, item, index);
      container.appendChild(entry);
    });
  }

  /** 渲染所有类型的条目列表 */
  function renderAllItems() {
    renderItems('education');
    renderItems('experience');
    renderItems('projects');
  }

  /** 获取条目表单HTML */
  function getItemHTML(type, item, index) {
    const removeBtn = `<button class="btn-remove-item" data-remove-type="${type}" data-remove-index="${index}">✕</button>`;

    switch (type) {
      case 'education':
        return `
          ${removeBtn}
          <div class="form-row">
            <div class="form-group">
              <label>学校名称</label>
              <input type="text" data-item-type="education" data-item-index="${index}" data-item-field="school" value="${escapeAttr(item.school)}" placeholder="如：北京大学">
            </div>
            <div class="form-group">
              <label>学历</label>
              <input type="text" data-item-type="education" data-item-index="${index}" data-item-field="degree" value="${escapeAttr(item.degree)}" placeholder="如：本科">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>专业</label>
              <input type="text" data-item-type="education" data-item-index="${index}" data-item-field="major" value="${escapeAttr(item.major)}" placeholder="如：计算机科学">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>开始时间</label>
              <input type="text" data-item-type="education" data-item-index="${index}" data-item-field="startDate" value="${escapeAttr(item.startDate)}" placeholder="如：2018.09">
            </div>
            <div class="form-group">
              <label>结束时间</label>
              <input type="text" data-item-type="education" data-item-index="${index}" data-item-field="endDate" value="${escapeAttr(item.endDate)}" placeholder="如：2022.06">
            </div>
          </div>
          <div class="form-group full-width textarea-with-ai">
            <label>补充描述</label>
            <textarea data-item-type="education" data-item-index="${index}" data-item-field="desc" rows="2" placeholder="如：GPA 3.8/4.0，校级奖学金">${escapeHTML(item.desc)}</textarea>
            <button class="btn-ai-optimize" data-ai-item-type="education" data-ai-item-index="${index}" data-ai-item-field="desc" data-ai-context="教育背景-补充描述" title="AI 优化">✨ AI 优化</button>
          </div>
        `;
      case 'experience':
        return `
          ${removeBtn}
          <div class="form-row">
            <div class="form-group">
              <label>公司名称</label>
              <input type="text" data-item-type="experience" data-item-index="${index}" data-item-field="company" value="${escapeAttr(item.company)}" placeholder="如：某某科技有限公司">
            </div>
            <div class="form-group">
              <label>职位</label>
              <input type="text" data-item-type="experience" data-item-index="${index}" data-item-field="position" value="${escapeAttr(item.position)}" placeholder="如：前端工程师">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>开始时间</label>
              <input type="text" data-item-type="experience" data-item-index="${index}" data-item-field="startDate" value="${escapeAttr(item.startDate)}" placeholder="如：2022.07">
            </div>
            <div class="form-group">
              <label>结束时间</label>
              <input type="text" data-item-type="experience" data-item-index="${index}" data-item-field="endDate" value="${escapeAttr(item.endDate)}" placeholder="如：至今">
            </div>
          </div>
          <div class="form-group full-width textarea-with-ai">
            <label>工作描述</label>
            <textarea data-item-type="experience" data-item-index="${index}" data-item-field="desc" rows="3" placeholder="描述主要工作内容和成果">${escapeHTML(item.desc)}</textarea>
            <button class="btn-ai-optimize" data-ai-item-type="experience" data-ai-item-index="${index}" data-ai-item-field="desc" data-ai-context="工作经历-工作描述" title="AI 优化">✨ AI 优化</button>
          </div>
        `;
      case 'projects':
        return `
          ${removeBtn}
          <div class="form-row">
            <div class="form-group">
              <label>项目名称</label>
              <input type="text" data-item-type="projects" data-item-index="${index}" data-item-field="projectName" value="${escapeAttr(item.projectName)}" placeholder="如：电商平台重构">
            </div>
            <div class="form-group">
              <label>担任角色</label>
              <input type="text" data-item-type="projects" data-item-index="${index}" data-item-field="role" value="${escapeAttr(item.role)}" placeholder="如：前端负责人">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>开始时间</label>
              <input type="text" data-item-type="projects" data-item-index="${index}" data-item-field="startDate" value="${escapeAttr(item.startDate)}" placeholder="如：2023.01">
            </div>
            <div class="form-group">
              <label>结束时间</label>
              <input type="text" data-item-type="projects" data-item-index="${index}" data-item-field="endDate" value="${escapeAttr(item.endDate)}" placeholder="如：2023.06">
            </div>
          </div>
          <div class="form-group full-width textarea-with-ai">
            <label>项目描述</label>
            <textarea data-item-type="projects" data-item-index="${index}" data-item-field="desc" rows="3" placeholder="描述项目内容、技术栈和个人贡献">${escapeHTML(item.desc)}</textarea>
            <button class="btn-ai-optimize" data-ai-item-type="projects" data-ai-item-index="${index}" data-ai-item-field="desc" data-ai-context="项目经历-项目描述" title="AI 优化">✨ AI 优化</button>
          </div>
        `;
      default:
        return '';
    }
  }

  // =====================
  // 事件绑定
  // =====================

  function bindEvents() {
    // 照片上传
    photoInput.addEventListener('change', handlePhotoUpload);
    btnRemovePhoto.addEventListener('click', removePhoto);

    // 导出 Word
    btnExport.addEventListener('click', exportWord);

    // 重置
    btnReset.addEventListener('click', () => {
      if (confirm('确定要清空所有简历内容吗？此操作不可撤销。')) {
        localStorage.removeItem(STORAGE_KEY);
        resumeData = getDefaultData();
        renderAllItems();
        restoreFormValues();
        updatePhotoUI();
        updatePreview();
        restoreModuleOrder();
        restoreDeletedModules();
      }
    });

    // 表单输入事件委托
    moduleList.addEventListener('input', handleFormInput);

    // 添加条目按钮
    moduleList.addEventListener('click', (e) => {
      const addBtn = e.target.closest('.btn-add-item');
      if (addBtn) {
        const type = addBtn.dataset.add;
        addItem(type);
      }

      // 删除条目
      const removeBtn = e.target.closest('.btn-remove-item');
      if (removeBtn) {
        const type = removeBtn.dataset.removeType;
        const index = parseInt(removeBtn.dataset.removeIndex);
        removeItem(type, index);
      }

      // 折叠/展开模块
      const toggleBtn = e.target.closest('.btn-toggle-module');
      if (toggleBtn) {
        const moduleEl = toggleBtn.closest('.module');
        const body = moduleEl.querySelector('.module-body');
        body.classList.toggle('collapsed');
        toggleBtn.textContent = body.classList.contains('collapsed') ? '▶' : '▼';
      }

      // 删除模块
      const deleteBtn = e.target.closest('.btn-delete-module');
      if (deleteBtn) {
        const moduleEl = deleteBtn.closest('.module');
        const moduleName = moduleEl.dataset.module;
        deleteModule(moduleName, moduleEl);
      }
    });
  }

  /** 处理表单输入 */
  function handleFormInput(e) {
    const target = e.target;

    // 个人信息字段
    if (target.dataset.field) {
      const field = target.dataset.field;
      // 判断属于哪个模块
      if (['name', 'jobTitle', 'phone', 'email', 'city', 'birthday', 'website'].includes(field)) {
        resumeData.profile[field] = target.value;
      } else if (field === 'skillsContent') {
        resumeData.skillsContent = target.value;
      } else if (field === 'summaryContent') {
        resumeData.summaryContent = target.value;
      } else if (field === 'awardsContent') {
        resumeData.awardsContent = target.value;
      }
    }

    // 多条目字段（教育/工作/项目）
    if (target.dataset.itemType) {
      const type = target.dataset.itemType;
      const index = parseInt(target.dataset.itemIndex);
      const field = target.dataset.itemField;
      if (resumeData[type] && resumeData[type][index] !== undefined) {
        resumeData[type][index][field] = target.value;
      }
    }

    updatePreview();
    saveToStorage();
  }

  // =====================
  // 条目增删
  // =====================

  function addItem(type) {
    const templates = {
      education: { school: '', major: '', degree: '', startDate: '', endDate: '', desc: '' },
      experience: { company: '', position: '', startDate: '', endDate: '', desc: '' },
      projects: { projectName: '', role: '', startDate: '', endDate: '', desc: '' }
    };
    if (!resumeData[type]) resumeData[type] = [];
    resumeData[type].push({ ...templates[type] });
    renderItems(type);
    updatePreview();
    saveToStorage();
  }

  function removeItem(type, index) {
    if (resumeData[type] && resumeData[type].length > 0) {
      resumeData[type].splice(index, 1);
      renderItems(type);
      updatePreview();
      saveToStorage();
    }
  }

  // =====================
  // 模块删除与恢复
  // =====================

  function deleteModule(moduleName, moduleEl) {
    if (!confirm(`确定删除「${MODULE_NAMES[moduleName] || moduleName}」模块吗？可在下方恢复。`)) return;

    moduleEl.style.display = 'none';
    if (!resumeData.deletedModules.includes(moduleName)) {
      resumeData.deletedModules.push(moduleName);
    }
    // 从模块顺序中移除
    resumeData.moduleOrder = resumeData.moduleOrder.filter(m => m !== moduleName);

    restoreDeletedModules();
    updatePreview();
    saveToStorage();
  }

  function restoreModule(moduleName) {
    const moduleEl = document.querySelector(`[data-module="${moduleName}"]`);
    if (moduleEl) {
      moduleEl.style.display = '';
    }
    resumeData.deletedModules = resumeData.deletedModules.filter(m => m !== moduleName);
    if (!resumeData.moduleOrder.includes(moduleName)) {
      resumeData.moduleOrder.push(moduleName);
    }
    restoreDeletedModules();
    updatePreview();
    saveToStorage();
  }

  function restoreDeletedModules() {
    // 隐藏已删除的模块
    resumeData.deletedModules.forEach(name => {
      const el = document.querySelector(`[data-module="${name}"]`);
      if (el) el.style.display = 'none';
    });

    // 显示恢复区域
    if (resumeData.deletedModules.length > 0) {
      deletedModulesContainer.style.display = '';
      deletedModulesList.innerHTML = '';
      resumeData.deletedModules.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'btn-restore-module';
        btn.textContent = MODULE_NAMES[name] || name;
        btn.addEventListener('click', () => restoreModule(name));
        deletedModulesList.appendChild(btn);
      });
    } else {
      deletedModulesContainer.style.display = 'none';
    }
  }

  // =====================
  // 拖拽排序
  // =====================

  function initSortable() {
    // 容错：如果 Sortable.js 未加载成功，跳过拖拽功能
    if (typeof Sortable === 'undefined') {
      console.warn('Sortable.js 未加载，拖拽排序功能不可用');
      return;
    }
    new Sortable(moduleList, {
      handle: '.draggable-handle',
      animation: 200,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      filter: '[data-fixed="true"]', // 个人信息模块不可拖拽
      preventOnFilter: false, // 不阻止 filter 匹配元素内的默认事件（修复输入框无法编辑）
      onEnd: () => {
        // 更新模块顺序
        const modules = moduleList.querySelectorAll('.module:not([data-fixed="true"])');
        resumeData.moduleOrder = Array.from(modules).map(m => m.dataset.module);
        updatePreview();
        saveToStorage();
      }
    });
  }

  /** 恢复保存的模块顺序 */
  function restoreModuleOrder() {
    const order = resumeData.moduleOrder;
    if (!order || order.length === 0) return;

    // 获取 profile 模块（固定在最前面）
    const profileModule = document.querySelector('[data-module="profile"]');

    // 按保存的顺序重新排列
    order.forEach(name => {
      const el = document.querySelector(`[data-module="${name}"]`);
      if (el) moduleList.appendChild(el);
    });
  }

  // =====================
  // 实时预览
  // =====================

  function updatePreview() {
    const html = generateResumeHTML();
    resumePreview.innerHTML = html || `
      <div class="resume-empty-tip">
        <p>👈 请在左侧填写简历内容</p>
        <p>右侧将实时显示简历效果</p>
      </div>
    `;
  }

  /** 生成简历预览HTML */
  function generateResumeHTML() {
    const p = resumeData.profile;
    const hasAnyContent = p.name || p.jobTitle || p.phone || p.email;

    if (!hasAnyContent) return '';

    let html = '';

    // --- 头部：照片 + 基本信息 ---
    html += '<div class="resume-header">';
    if (p.photo) {
      html += `<img class="resume-photo" src="${p.photo}" alt="照片">`;
    }
    html += '<div class="resume-info">';
    if (p.name) html += `<div class="resume-name">${escapeHTML(p.name)}</div>`;
    if (p.jobTitle) html += `<div class="resume-job-title">${escapeHTML(p.jobTitle)}</div>`;

    // 联系方式
    const contacts = [];
    if (p.phone) contacts.push(`📱 ${escapeHTML(p.phone)}`);
    if (p.email) contacts.push(`✉️ ${escapeHTML(p.email)}`);
    if (p.city) contacts.push(`📍 ${escapeHTML(p.city)}`);
    if (p.birthday) contacts.push(`🎂 ${escapeHTML(p.birthday)}`);
    if (p.website) contacts.push(`🔗 ${escapeHTML(p.website)}`);

    if (contacts.length > 0) {
      html += '<div class="resume-contact">';
      contacts.forEach(c => {
        html += `<span class="resume-contact-item">${c}</span>`;
      });
      html += '</div>';
    }

    html += '</div></div>';

    // --- 按模块顺序渲染各模块 ---
    const order = resumeData.moduleOrder || [];
    order.forEach(moduleName => {
      if (resumeData.deletedModules.includes(moduleName)) return;
      const section = renderResumeSection(moduleName);
      if (section) html += section;
    });

    return html;
  }

  /** 渲染简历中的一个模块 */
  function renderResumeSection(moduleName) {
    const sectionTitles = {
      education: '教育背景',
      experience: '工作经历',
      projects: '项目经历',
      skills: '专业技能',
      summary: '自我评价',
      awards: '荣誉证书'
    };

    const title = sectionTitles[moduleName];
    if (!title) return '';

    let content = '';

    switch (moduleName) {
      case 'education': {
        const items = resumeData.education || [];
        const validItems = items.filter(i => i.school || i.major || i.degree);
        if (validItems.length === 0) return '';
        content = validItems.map(i => `
          <div class="resume-item">
            <div class="resume-item-header">
              <div>
                <span class="resume-item-title">${escapeHTML(i.school)}</span>
                ${i.major ? `<span class="resume-item-subtitle"> · ${escapeHTML(i.major)}</span>` : ''}
                ${i.degree ? `<span class="resume-item-subtitle"> · ${escapeHTML(i.degree)}</span>` : ''}
              </div>
              <span class="resume-item-date">${escapeHTML(i.startDate)}${i.endDate ? ' - ' + escapeHTML(i.endDate) : ''}</span>
            </div>
            ${i.desc ? `<div class="resume-item-desc">${escapeHTML(i.desc)}</div>` : ''}
          </div>
        `).join('');
        break;
      }
      case 'experience': {
        const items = resumeData.experience || [];
        const validItems = items.filter(i => i.company || i.position);
        if (validItems.length === 0) return '';
        content = validItems.map(i => `
          <div class="resume-item">
            <div class="resume-item-header">
              <div>
                <span class="resume-item-title">${escapeHTML(i.company)}</span>
                ${i.position ? `<span class="resume-item-subtitle"> · ${escapeHTML(i.position)}</span>` : ''}
              </div>
              <span class="resume-item-date">${escapeHTML(i.startDate)}${i.endDate ? ' - ' + escapeHTML(i.endDate) : ''}</span>
            </div>
            ${i.desc ? `<div class="resume-item-desc">${escapeHTML(i.desc)}</div>` : ''}
          </div>
        `).join('');
        break;
      }
      case 'projects': {
        const items = resumeData.projects || [];
        const validItems = items.filter(i => i.projectName || i.role);
        if (validItems.length === 0) return '';
        content = validItems.map(i => `
          <div class="resume-item">
            <div class="resume-item-header">
              <div>
                <span class="resume-item-title">${escapeHTML(i.projectName)}</span>
                ${i.role ? `<span class="resume-item-subtitle"> · ${escapeHTML(i.role)}</span>` : ''}
              </div>
              <span class="resume-item-date">${escapeHTML(i.startDate)}${i.endDate ? ' - ' + escapeHTML(i.endDate) : ''}</span>
            </div>
            ${i.desc ? `<div class="resume-item-desc">${escapeHTML(i.desc)}</div>` : ''}
          </div>
        `).join('');
        break;
      }
      case 'skills': {
        if (!resumeData.skillsContent) return '';
        content = `<div class="resume-text-block">${escapeHTML(resumeData.skillsContent)}</div>`;
        break;
      }
      case 'summary': {
        if (!resumeData.summaryContent) return '';
        content = `<div class="resume-text-block">${escapeHTML(resumeData.summaryContent)}</div>`;
        break;
      }
      case 'awards': {
        if (!resumeData.awardsContent) return '';
        content = `<div class="resume-text-block">${escapeHTML(resumeData.awardsContent)}</div>`;
        break;
      }
    }

    if (!content) return '';

    return `
      <div class="resume-section">
        <div class="resume-section-title">${title}</div>
        ${content}
      </div>
    `;
  }

  // =====================
  // 导出 Word
  // =====================

  async function exportWord() {
    const p = resumeData.profile;
    if (!p.name) {
      alert('请至少填写姓名后再导出');
      return;
    }

    // 容错：检查 docx 和 saveAs 是否可用
    if (typeof docx === 'undefined' || typeof saveAs === 'undefined') {
      alert('导出功能所需的库尚未加载完成，请检查网络连接后刷新页面重试。');
      return;
    }

    try {
      const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, ImageRun, Tab, TabStopPosition, TabStopType } = docx;

      const children = [];

      // --- 姓名 ---
      children.push(new Paragraph({
        children: [new TextRun({ text: p.name, bold: true, size: 32, font: 'Microsoft YaHei' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 }
      }));

      // --- 求职意向 ---
      if (p.jobTitle) {
        children.push(new Paragraph({
          children: [new TextRun({ text: p.jobTitle, size: 22, color: '555555', font: 'Microsoft YaHei' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 }
        }));
      }

      // --- 联系方式 ---
      const contactParts = [];
      if (p.phone) contactParts.push(p.phone);
      if (p.email) contactParts.push(p.email);
      if (p.city) contactParts.push(p.city);
      if (p.birthday) contactParts.push(p.birthday);
      if (p.website) contactParts.push(p.website);

      if (contactParts.length > 0) {
        children.push(new Paragraph({
          children: [new TextRun({ text: contactParts.join('  |  '), size: 18, color: '666666', font: 'Microsoft YaHei' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        }));
      }

      // --- 分隔线 ---
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' } },
        spacing: { after: 200 }
      }));

      // --- 按模块顺序输出 ---
      const order = resumeData.moduleOrder || [];
      for (const moduleName of order) {
        if (resumeData.deletedModules.includes(moduleName)) continue;
        const sectionChildren = generateWordSection(moduleName);
        if (sectionChildren.length > 0) {
          children.push(...sectionChildren);
        }
      }

      // 创建文档
      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: { top: 720, bottom: 720, left: 720, right: 720 }
            }
          },
          children
        }]
      });

      // 生成并下载
      const blob = await docx.Packer.toBlob(doc);
      saveAs(blob, `${p.name}_简历.docx`);
    } catch (err) {
      console.error('导出Word失败:', err);
      alert('导出失败，请检查是否所有资源已加载。');
    }
  }

  /** 生成 Word 某个模块的段落 */
  function generateWordSection(moduleName) {
    const { Paragraph, TextRun, HeadingLevel, BorderStyle, AlignmentType, TabStopPosition, TabStopType } = docx;

    const sectionTitles = {
      education: '教育背景',
      experience: '工作经历',
      projects: '项目经历',
      skills: '专业技能',
      summary: '自我评价',
      awards: '荣誉证书'
    };

    const title = sectionTitles[moduleName];
    if (!title) return [];

    const children = [];

    // 模块标题
    const titleParagraph = new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 24, font: 'Microsoft YaHei' })],
      spacing: { before: 200, after: 100 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: '000000' } }
    });

    switch (moduleName) {
      case 'education': {
        const items = (resumeData.education || []).filter(i => i.school || i.major);
        if (items.length === 0) return [];
        children.push(titleParagraph);
        items.forEach(item => {
          // 学校 + 时间
          const headerParts = [item.school, item.major, item.degree].filter(Boolean).join(' · ');
          const dateParts = [item.startDate, item.endDate].filter(Boolean).join(' - ');
          children.push(new Paragraph({
            children: [
              new TextRun({ text: headerParts, bold: true, size: 20, font: 'Microsoft YaHei' }),
              new TextRun({ text: '    ' + dateParts, size: 18, color: '888888', font: 'Microsoft YaHei' })
            ],
            spacing: { before: 80 }
          }));
          if (item.desc) {
            children.push(new Paragraph({
              children: [new TextRun({ text: item.desc, size: 18, font: 'Microsoft YaHei' })],
              spacing: { before: 40, after: 40 }
            }));
          }
        });
        break;
      }
      case 'experience': {
        const items = (resumeData.experience || []).filter(i => i.company || i.position);
        if (items.length === 0) return [];
        children.push(titleParagraph);
        items.forEach(item => {
          const headerParts = [item.company, item.position].filter(Boolean).join(' · ');
          const dateParts = [item.startDate, item.endDate].filter(Boolean).join(' - ');
          children.push(new Paragraph({
            children: [
              new TextRun({ text: headerParts, bold: true, size: 20, font: 'Microsoft YaHei' }),
              new TextRun({ text: '    ' + dateParts, size: 18, color: '888888', font: 'Microsoft YaHei' })
            ],
            spacing: { before: 80 }
          }));
          if (item.desc) {
            item.desc.split('\n').forEach(line => {
              children.push(new Paragraph({
                children: [new TextRun({ text: line, size: 18, font: 'Microsoft YaHei' })],
                spacing: { before: 20 }
              }));
            });
          }
        });
        break;
      }
      case 'projects': {
        const items = (resumeData.projects || []).filter(i => i.projectName || i.role);
        if (items.length === 0) return [];
        children.push(titleParagraph);
        items.forEach(item => {
          const headerParts = [item.projectName, item.role].filter(Boolean).join(' · ');
          const dateParts = [item.startDate, item.endDate].filter(Boolean).join(' - ');
          children.push(new Paragraph({
            children: [
              new TextRun({ text: headerParts, bold: true, size: 20, font: 'Microsoft YaHei' }),
              new TextRun({ text: '    ' + dateParts, size: 18, color: '888888', font: 'Microsoft YaHei' })
            ],
            spacing: { before: 80 }
          }));
          if (item.desc) {
            item.desc.split('\n').forEach(line => {
              children.push(new Paragraph({
                children: [new TextRun({ text: line, size: 18, font: 'Microsoft YaHei' })],
                spacing: { before: 20 }
              }));
            });
          }
        });
        break;
      }
      case 'skills': {
        if (!resumeData.skillsContent) return [];
        children.push(titleParagraph);
        resumeData.skillsContent.split('\n').forEach(line => {
          children.push(new Paragraph({
            children: [new TextRun({ text: line, size: 18, font: 'Microsoft YaHei' })],
            spacing: { before: 20 }
          }));
        });
        break;
      }
      case 'summary': {
        if (!resumeData.summaryContent) return [];
        children.push(titleParagraph);
        resumeData.summaryContent.split('\n').forEach(line => {
          children.push(new Paragraph({
            children: [new TextRun({ text: line, size: 18, font: 'Microsoft YaHei' })],
            spacing: { before: 20 }
          }));
        });
        break;
      }
      case 'awards': {
        if (!resumeData.awardsContent) return [];
        children.push(titleParagraph);
        resumeData.awardsContent.split('\n').forEach(line => {
          children.push(new Paragraph({
            children: [new TextRun({ text: line, size: 18, font: 'Microsoft YaHei' })],
            spacing: { before: 20 }
          }));
        });
        break;
      }
    }

    return children;
  }

  // =====================
  // AI 优化功能
  // =====================

  // AI 设置已内置，无需加载/保存/恢复

  /** 绑定 AI 相关事件 */
  function bindAIEvents() {
    // AI 结果弹窗
    document.getElementById('btn-close-ai-result').addEventListener('click', () => {
      aiResultModal.style.display = 'none';
    });

    document.getElementById('btn-discard-ai').addEventListener('click', () => {
      aiResultModal.style.display = 'none';
    });

    document.getElementById('btn-apply-ai').addEventListener('click', applyAIResult);

    // 点击遮罩关闭结果弹窗
    aiResultModal.addEventListener('click', (e) => {
      if (e.target === aiResultModal) aiResultModal.style.display = 'none';
    });

    // AI 优化按钮事件委托（处理动态生成的按钮）
    moduleList.addEventListener('click', (e) => {
      const aiBtn = e.target.closest('.btn-ai-optimize');
      if (aiBtn) {
        e.preventDefault();
        e.stopPropagation();
        handleAIOptimize(aiBtn);
      }
    });
  }

  /** 处理 AI 优化按钮点击 */
  function handleAIOptimize(btn) {
    let originalText = '';
    let context = btn.dataset.aiContext || '简历内容';

    // 判断是固定字段还是动态条目字段
    if (btn.dataset.aiTarget) {
      // 固定字段：skillsContent, summaryContent, awardsContent
      const fieldName = btn.dataset.aiTarget;
      const textarea = document.querySelector(`[data-field="${fieldName}"]`);
      originalText = textarea ? textarea.value : '';
      currentAITarget = { type: 'field', fieldName };
    } else if (btn.dataset.aiItemType) {
      // 动态条目字段
      const itemType = btn.dataset.aiItemType;
      const itemIndex = btn.dataset.aiItemIndex;
      const itemField = btn.dataset.aiItemField;
      const textarea = document.querySelector(
        `textarea[data-item-type="${itemType}"][data-item-index="${itemIndex}"][data-item-field="${itemField}"]`
      );
      originalText = textarea ? textarea.value : '';
      currentAITarget = { type: 'item', itemType, itemIndex: parseInt(itemIndex), itemField };
    }

    if (!originalText.trim()) {
      alert('请先填写一些内容，AI 才能帮你优化。');
      return;
    }

    // 显示结果弹窗并开始请求
    showAIResultModal(originalText, context);
  }

  /** 显示 AI 结果弹窗，发起请求 */
  async function showAIResultModal(originalText, context) {
    aiResultModal.style.display = 'flex';
    aiLoading.style.display = 'flex';
    aiResultContent.style.display = 'none';
    aiResultFooter.style.display = 'none';
    aiError.style.display = 'none';

    try {
      const optimizedText = await callAIAPI(originalText, context);

      aiLoading.style.display = 'none';
      aiResultContent.style.display = 'block';
      aiResultFooter.style.display = 'flex';
      aiOriginalText.textContent = originalText;
      aiOptimizedText.value = optimizedText;
    } catch (err) {
      aiLoading.style.display = 'none';
      aiError.style.display = 'block';
      aiError.textContent = '❌ AI 优化失败：' + (err.message || '未知错误，请检查 API 设置。');
      aiResultFooter.style.display = 'none';
    }
  }

  /** 调用 AI API（兼容 OpenAI 格式） */
  async function callAIAPI(text, context) {
    const baseUrl = aiSettings.baseUrl.replace(/\/+$/, ''); // 去除末尾斜杠
    const url = `${baseUrl}/chat/completions`;

    const systemPrompt = `你是一位专业的简历优化顾问。请帮用户优化以下简历中「${context}」部分的内容。
要求：
1. 语言精炼、专业，使用简历中常见的正式表述
2. 突出成果和数据（如有相关信息可以量化）
3. 使用动词开头的短句或条目式描述（用 • 列表形式）
4. 保持内容真实，不要捏造不存在的信息，只基于原文进行润色优化
5. 直接输出优化后的内容，不要输出解释或说明`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiSettings.apiKey}`
      },
      body: JSON.stringify({
        model: aiSettings.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`API 请求失败 (${response.status}): ${errorBody || response.statusText}`);
    }

    const data = await response.json();

    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      return data.choices[0].message.content.trim();
    }

    throw new Error('API 返回数据格式异常，请检查 API 设置。');
  }

  /** 采用 AI 优化结果，写回对应的 textarea */
  function applyAIResult() {
    if (!currentAITarget) return;

    const optimizedText = aiOptimizedText.value;

    if (currentAITarget.type === 'field') {
      // 固定字段：skillsContent, summaryContent, awardsContent
      const fieldName = currentAITarget.fieldName;
      const textarea = document.querySelector(`[data-field="${fieldName}"]`);
      if (textarea) {
        textarea.value = optimizedText;
        // 更新数据
        if (fieldName === 'skillsContent') resumeData.skillsContent = optimizedText;
        else if (fieldName === 'summaryContent') resumeData.summaryContent = optimizedText;
        else if (fieldName === 'awardsContent') resumeData.awardsContent = optimizedText;
      }
    } else if (currentAITarget.type === 'item') {
      // 动态条目字段
      const { itemType, itemIndex, itemField } = currentAITarget;
      const textarea = document.querySelector(
        `textarea[data-item-type="${itemType}"][data-item-index="${itemIndex}"][data-item-field="${itemField}"]`
      );
      if (textarea) {
        textarea.value = optimizedText;
        // 更新数据
        if (resumeData[itemType] && resumeData[itemType][itemIndex]) {
          resumeData[itemType][itemIndex][itemField] = optimizedText;
        }
      }
    }

    // 关闭弹窗，更新预览并保存
    aiResultModal.style.display = 'none';
    currentAITarget = null;
    updatePreview();
    saveToStorage();
  }

  // =====================
  // 工具函数
  // =====================

  /** HTML 转义（防 XSS） */
  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 属性值转义 */
  function escapeAttr(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // =====================
  // 启动
  // =====================
  // 使用多种方式确保初始化执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM 已经加载完毕（脚本在 body 末尾加载时常见）
    init();
  }

})();

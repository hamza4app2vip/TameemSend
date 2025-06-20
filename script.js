// تكوين البوت والإعدادات
const CONFIG = {
  token: '7619744256:AAGlTErNoXyRAoBwNO0f8SNwDBzIA2y1Pws',
  apiEndpoint: 'https://api.telegram.org/bot',
  localStorageKey: 'telegram-bot-sent-messages'
};

// عناصر DOM
const elements = {
  status: document.getElementById('status'),
  message: document.getElementById('message'),
  sendBtn: document.getElementById('sendBtn'),
  feedback: document.getElementById('feedback'),
  sentMessagesList: document.getElementById('sentMessagesList'),
  replyPreview: document.getElementById('replyPreview'),
  replyText: document.getElementById('replyText'),
  cancelReplyBtn: document.getElementById('cancelReplyBtn'),
  charCounter: document.getElementById('charCounter'),
  clearDeletedBtn: document.getElementById('clearDeletedBtn'),
  imageInput: document.getElementById('imageInput'),
  uploadImageBtn: document.getElementById('uploadImageBtn'),
  imageUploadLabel: document.querySelector('.image-upload-label'),
  imagePreview: document.getElementById('imagePreview')
};

// حالة التطبيق
let appState = {
  chatId: null,
  isConnected: false,
  sentMessages: [],
  replyTo: null
};

// مؤقتات الكتابة والحالة
let typingTimer, idleTimer;
let lastStatus = { message: '', type: '' };

// الصورة المختارة
let selectedImage = null;

// دوال مساعدة
const utils = {
  validateInput(input) {
    return typeof input === 'string' && input.trim().length > 0 && input.length <= 1000;
  },

  showLoader(element, message = 'جارٍ المعالجة...') {
    element.innerHTML = `
      <div class="spinner" role="status" aria-live="polite" aria-label="${message}"></div>
      <span>${message}</span>
    `;
  },

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  },

  updateStatus(message, type = 'info') {
    elements.status.textContent = message;
    elements.status.className = `status ${type}`;
  },

  saveDraft() {
    localStorage.setItem('telegram-bot-draft', elements.message.value);
  },

  loadDraft() {
    const draft = localStorage.getItem('telegram-bot-draft');
    if (draft) elements.message.value = draft;
  },

  saveSentMessages() {
    try {
      localStorage.setItem(CONFIG.localStorageKey, JSON.stringify(appState.sentMessages));
    } catch (e) {
      console.warn('فشل حفظ الرسائل المرسلة محليًا', e);
    }
  },

  loadSentMessages() {
    try {
      const data = localStorage.getItem(CONFIG.localStorageKey);
      appState.sentMessages = data ? JSON.parse(data) : [];
    } catch (e) {
      appState.sentMessages = [];
    }
  },

  renderSentMessages() {
    elements.sentMessagesList.innerHTML = '';
    if (appState.sentMessages.length === 0) {
      elements.sentMessagesList.innerHTML =
        '<p style="color: rgba(255,255,255,0.6); font-style: italic;">لا توجد رسائل مرسلة حتى الآن.</p>';
      return;
    }

    appState.sentMessages.forEach((msg, index) => {
      const item = document.createElement('div');
      item.className = 'sent-message-item';
      item.setAttribute('role', 'listitem');
      item.style.cursor = msg.deleted ? 'default' : 'pointer';
      item.title = msg.deleted ? 'هذه الرسالة تم حذفها' : 'انقر للرد على هذه الرسالة';

      if (msg.deleted) {
        item.style.color = '#f44336';
        item.style.opacity = '0.6';
        item.style.fontStyle = 'italic';
        item.style.textDecoration = 'line-through';
        item.style.background = 'rgba(244,67,54,0.08)';
      } else {
        item.style.color = '#e0e0e0';
        item.style.opacity = '1';
        item.style.fontStyle = 'normal';
        item.style.textDecoration = 'none';
        item.style.background = '';
      }

      const safeText = msg.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\n/g, '<br>');

      const textDiv = document.createElement('div');
      textDiv.className = 'sent-message-text';

      if (msg.reply_to_text) {
        const replyDiv = document.createElement('div');
        replyDiv.className = 'reply-quote';
        replyDiv.innerHTML = msg.reply_to_text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
          .replace(/\n/g, '<br>');
        textDiv.appendChild(replyDiv);
      }

      const messageContent = document.createElement('div');
      messageContent.innerHTML = safeText;
      textDiv.appendChild(messageContent);

      if (msg.is_image) {
        const imageDiv = document.createElement('div');
        imageDiv.className = 'sent-message-image';
        imageDiv.innerHTML = '<i class="fa fa-image" aria-hidden="true"></i> صورة';
        textDiv.appendChild(imageDiv);
      }

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.setAttribute('aria-label', `حذف الرسالة رقم ${index + 1}`);
      deleteBtn.title = 'حذف الرسالة';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.disabled = msg.deleted;
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!msg.deleted) await deleteSentMessage(index);
      });

      item.appendChild(textDiv);
      item.appendChild(deleteBtn);

      if (!msg.deleted) {
        item.addEventListener('click', () => {
          setReplyToMessage(index);
        });
      }

      elements.sentMessagesList.appendChild(item);
    });
  },

  addSentMessage(msg) {
    appState.sentMessages.unshift(msg);
    utils.saveSentMessages();
    utils.renderSentMessages();
  }
};

// API
const api = {
  async makeRequest(endpoint, options = {}) {
    const response = await fetch(`${CONFIG.apiEndpoint}${CONFIG.token}/${endpoint}`, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options.body || null
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  },

  async testConnection() {
    try {
      const data = await this.makeRequest('getMe');
      return data.ok;
    } catch {
      return false;
    }
  },

  async getUpdates() {
    try {
      const data = await this.makeRequest('getUpdates');
      return data.ok ? data.result : [];
    } catch {
      return [];
    }
  }
};

// تعيين رسالة للرد عليها
function setReplyToMessage(index) {
  const msg = appState.sentMessages[index];
  if (!msg) return;
  appState.replyTo = msg;
  elements.replyPreview.style.display = 'block';
  elements.replyText.textContent = msg.text.length > 100 ? msg.text.slice(0, 100) + '...' : msg.text;
  elements.message.focus();
}

// إلغاء الرد
function cancelReply() {
  appState.replyTo = null;
  elements.replyPreview.style.display = 'none';
  elements.replyText.textContent = '';
}

// حذف رسالة من البوت والموقع
async function deleteMessage(chatId, messageId) {
  try {
    const response = await fetch(`${CONFIG.apiEndpoint}${CONFIG.token}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    });
    const data = await response.json();
    return data.ok;
  } catch {
    return false;
  }
}

async function deleteSentMessage(index) {
  if (index < 0 || index >= appState.sentMessages.length) return;
  const msg = appState.sentMessages[index];
  if (!msg.message_id) {
    appState.sentMessages.splice(index, 1);
    utils.saveSentMessages();
    utils.renderSentMessages();
    utils.showNotification('تم حذف الرسالة محليًا', 'warning');
    return;
  }
  const success = await deleteMessage(appState.chatId, msg.message_id);
  if (success) {
    appState.sentMessages[index].deleted = true;
    utils.saveSentMessages();
    utils.renderSentMessages();
    utils.showNotification('تم حذف الرسالة من البوت، وتم تمييزها كمحذوفة', 'error');
  } else {
    utils.showNotification('فشل حذف الرسالة من البوت', 'error');
  }
}

// تحديث عداد الحروف مع تغيير اللون حسب المستويات
function updateCharCounter() {
  const length = elements.message.value.length;
  elements.charCounter.textContent = `${length} / 1000`;
  elements.charCounter.style.color = '#fff';
  elements.charCounter.style.fontWeight = '600';
  if (length >= 1500) {
    elements.charCounter.style.color = '#d32f2f';
    elements.charCounter.style.fontWeight = 'bold';
  } else if (length >= 500) {
    elements.charCounter.style.color = '#f57c00';
    elements.charCounter.style.fontWeight = 'bold';
  } else if (length >= 200) {
    elements.charCounter.style.color = '#fbc02d';
    elements.charCounter.style.fontWeight = '600';
  }
}

// إزالة كل الرسائل المحذوفة من الموقع
function clearAllDeletedMessages() {
  const beforeCount = appState.sentMessages.length;
  appState.sentMessages = appState.sentMessages.filter(msg => !msg.deleted);
  const afterCount = appState.sentMessages.length;
  if (beforeCount === afterCount) {
    utils.showNotification('لا توجد رسائل محذوفة للحذف', 'warning');
    return;
  }
  utils.saveSentMessages();
  utils.renderSentMessages();
  utils.showNotification(`تم حذف ${beforeCount - afterCount} رسالة محذوفة من الموقع`, 'success');
}

// عرض الصورة المختارة مع معلومات الحجم والنوع وشريط التقدم والسرعة
function displaySelectedImage(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    elements.imagePreview.innerHTML = `<img src="${e.target.result}" alt="صورة مختارة" style="max-width:100%; border-radius:12px;">`;
    elements.imagePreview.style.display = 'block';
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    const type = file.type.split('/')[1].toUpperCase();
    const infoLabel = document.createElement('div');
    infoLabel.className = 'upload-info-label';
    infoLabel.innerHTML = `الحجم: <b>${sizeMB} MB</b> | النوع: <b>${type}</b>`;
    elements.imagePreview.appendChild(infoLabel);
    const progressBar = document.createElement('div');
    progressBar.className = 'upload-progress-bar';
    progressBar.innerHTML = `<div class="progress-inner" style="width:0%;">0%</div>`;
    elements.imagePreview.appendChild(progressBar);
    const speedLabel = document.createElement('div');
    speedLabel.className = 'upload-speed-label';
    speedLabel.innerHTML = `السرعة: <b>0 KB/s</b>`;
    elements.imagePreview.appendChild(speedLabel);
    selectedImage = file;
    elements.uploadProgressBar = progressBar.querySelector('.progress-inner');
    elements.uploadSpeedLabel = speedLabel;
  };
  reader.readAsDataURL(file);
}

// إرسال الصورة مع progress وسرعة الرفع
async function sendImageToBot() {
  if (!selectedImage) {
    utils.showNotification('الرجاء اختيار صورة أولاً', 'warning');
    return;
  }
  if (!appState.chatId) {
    utils.showNotification('لم يتم تحديد محادثة نشطة', 'error');
    return;
  }
  elements.feedback.innerHTML = '<span style="color: #fbc02d;">يتم رفع الصورة...</span>';
  const formData = new FormData();
  formData.append('chat_id', appState.chatId);
  formData.append('photo', selectedImage);
  if (elements.message.value.trim()) {
    formData.append('caption', elements.message.value.trim());
    formData.append('parse_mode', 'HTML');
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${CONFIG.apiEndpoint}${CONFIG.token}/sendPhoto`, true);
    const startTime = Date.now();
    let lastLoaded = 0;
    xhr.upload.onprogress = function(event) {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = ((event.loaded - lastLoaded) / 1024 / (elapsed || 1)).toFixed(2);
        lastLoaded = event.loaded;
        if (elements.uploadProgressBar) {
          elements.uploadProgressBar.style.width = percent + '%';
          elements.uploadProgressBar.textContent = percent + '%';
        }
        if (elements.uploadSpeedLabel) {
          let speedText = speed < 1024 ? `${speed} KB/s` : `${(speed / 1024).toFixed(2)} MB/s`;
          elements.uploadSpeedLabel.innerHTML = `السرعة: <b>${speedText}</b>`;
        }
      }
    };
    xhr.onload = function() {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        if (data.ok) {
          elements.feedback.innerHTML = '<span style="color: #4caf50;">✅ تم إرسال الصورة بنجاح!</span>';
          utils.showNotification('تم إرسال الصورة', 'success');
          const sentMsg = {
            text: elements.message.value || 'صورة',
            timestamp: new Date().toISOString(),
            message_id: data.result.message_id,
            is_image: true,
            image_id: data.result.photo[0].file_id,
            reply_to_message_id: appState.replyTo ? appState.replyTo.message_id : null,
            reply_to_text: appState.replyTo ? appState.replyTo.text : null
          };
          utils.addSentMessage(sentMsg);
          elements.message.value = '';
          selectedImage = null;
          elements.imagePreview.style.display = 'none';
          elements.imagePreview.innerHTML = '';
          localStorage.removeItem('telegram-bot-draft');
          cancelReply();
          updateCharCounter();
          resolve();
        } else {
          elements.feedback.innerHTML = `<span style="color: #f44336;">❌ فشل في إرسال الصورة: ${data.description}</span>`;
          reject();
        }
      } else {
        elements.feedback.innerHTML = '<span style="color: #f44336;">❌ حدث خطأ في الشبكة</span>';
        reject();
      }
    };
    xhr.onerror = function() {
      elements.feedback.innerHTML = '<span style="color: #f44336;">❌ حدث خطأ في الشبكة</span>';
      reject();
    };
    xhr.send(formData);
  });
}

// إرسال رسالة نصية أو صورة مع تعليق
async function sendCurrentMessage() {
  if (selectedImage) {
    await sendImageToBot();
  } else {
    const message = elements.message.value.trim();
    if (!utils.validateInput(message)) {
      elements.feedback.innerHTML = '<span style="color: #f44336;">يرجى كتابة رسالة صالحة</span>';
      return;
    }
    if (!appState.chatId) {
      elements.feedback.innerHTML = '<span style="color: #f44336;">لم يتم تحديد محادثة نشطة</span>';
      return;
    }
    elements.sendBtn.disabled = true;
    utils.showLoader(elements.feedback, 'جارٍ إرسال الرسالة...');
    try {
      const bodyData = {
        chat_id: appState.chatId,
        text: message,
        parse_mode: 'HTML'
      };
      if (appState.replyTo && appState.replyTo.message_id) {
        bodyData.reply_to_message_id = appState.replyTo.message_id;
      }
      const response = await fetch(`${CONFIG.apiEndpoint}${CONFIG.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });
      const data = await response.json();
      if (data.ok) {
        elements.feedback.innerHTML = '<span style="color: #4caf50;">✅ تم إرسال الرسالة بنجاح!</span>';
        utils.showNotification('تم إرسال الرسالة', 'success');
        const sentMsg = {
          text: message,
          timestamp: new Date().toISOString(),
          message_id: data.result.message_id,
          reply_to_message_id: appState.replyTo ? appState.replyTo.message_id : null,
          reply_to_text: appState.replyTo ? appState.replyTo.text : null
        };
        utils.addSentMessage(sentMsg);
        elements.message.value = '';
        localStorage.removeItem('telegram-bot-draft');
        cancelReply();
        updateCharCounter();
      } else {
        elements.feedback.innerHTML = '<span style="color: #f44336;">❌ فشل في إرسال الرسالة</span>';
      }
    } catch {
      elements.feedback.innerHTML = '<span style="color: #f44336;">❌ حدث خطأ في الشبكة</span>';
    } finally {
      elements.sendBtn.disabled = false;
    }
  }
}

// إعداد مستمعي الأحداث
function setupEventListeners() {
  elements.sendBtn.addEventListener('click', sendCurrentMessage);
  elements.message.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendCurrentMessage();
    }
  });
  elements.message.addEventListener('input', () => {
    utils.saveDraft();
    updateCharCounter();
    if (!appState.isConnected) return;
    clearTimeout(typingTimer);
    clearTimeout(idleTimer);
    utils.updateStatus('جارٍ الكتابة...', 'warning');
    elements.feedback.innerHTML = '';
    typingTimer = setTimeout(() => {
      lastStatus.message = appState.chatId ? '✅ متصل' : '❌ غير متصل';
      lastStatus.type = appState.chatId ? 'success' : 'error';
      utils.updateStatus(lastStatus.message, lastStatus.type);
      idleTimer = setTimeout(() => {
        utils.updateStatus('استمر في الكتابة، ما بك؟', 'warning');
        setTimeout(() => {
          utils.updateStatus(lastStatus.message, lastStatus.type);
        }, 3000);
      }, 8000);
    }, 1000);
  });
  elements.cancelReplyBtn.addEventListener('click', cancelReply);
  if (elements.clearDeletedBtn) {
    elements.clearDeletedBtn.addEventListener('click', clearAllDeletedMessages);
  }
  if (elements.imageInput) {
    elements.imageInput.addEventListener('change', (event) => {
      if (event.target.files && event.target.files[0]) {
        const file = event.target.files[0];
        if (!file.type.match('image.*')) {
          utils.showNotification('يرجى اختيار ملف صورة صالح', 'error');
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          utils.showNotification('حجم الصورة يجب أن يكون أقل من 10 ميجابايت', 'error');
          return;
        }
        displaySelectedImage(file);
      }
    });
  }
  if (elements.uploadImageBtn) {
    elements.uploadImageBtn.addEventListener('click', sendImageToBot);
  }
  if (elements.imageUploadLabel) {
    elements.imageUploadLabel.addEventListener('click', () => {
      elements.imageInput.click();
    });
  }
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    if (tg.themeParams?.button_color) {
      document.documentElement.style.setProperty('--primary-color', tg.themeParams.button_color);
    }
    tg.MainButton.setText('إرسال رسالة');
    tg.MainButton.onClick(sendCurrentMessage);
    tg.MainButton.show();
  }
}

// بدء التطبيق
document.addEventListener('DOMContentLoaded', () => {
  utils.loadDraft();
  utils.loadSentMessages();
  utils.renderSentMessages();
  updateCharCounter();
  setupEventListeners();
  init();
});

// اختبار اتصال البوت وتهيئة التطبيق
async function init() {
  if (!CONFIG.token) {
    utils.updateStatus('❌ لم يتم تعيين توكن البوت', 'error');
    return;
  }
  utils.showLoader(elements.status, 'جارٍ اختبار اتصال البوت...');
  try {
    const isConnected = await api.testConnection();
    if (isConnected) {
      utils.updateStatus('✅ تم الاتصال بنجاح!', 'success');
      appState.isConnected = true;
      const updates = await api.getUpdates();
      if (updates.length > 0) {
        let foundChatId = null;
        for (let i = updates.length - 1; i >= 0; i--) {
          if (updates[i].message?.chat?.id) {
            foundChatId = updates[i].message.chat.id;
            break;
          }
        }
        if (foundChatId) {
          appState.chatId = foundChatId;
          await api.makeRequest('sendMessage', {
            method: 'POST',
            body: JSON.stringify({
              chat_id: appState.chatId,
              text: 'تم الاتصال بنجاح! مرحبًا بك.',
              parse_mode: 'HTML'
            })
          });
          utils.showNotification('تم العثور على محادثة نشطة', 'success');
        } else {
          elements.feedback.innerHTML =
            '<span style="color: #fdd835;">أرسل رسالة للبوت أولاً لتفعيل المحادثة</span>';
        }
      } else {
        elements.feedback.innerHTML =
          '<span style="color: #fdd835;">أرسل رسالة للبوت أولاً لتفعيل المحادثة</span>';
      }
    } else {
      utils.updateStatus('❌ فشل الاتصال بالبوت', 'error');
    }
  } catch {
    utils.updateStatus('❌ حدث خطأ في الشبكة', 'error');
  }
}

// معالجة الأخطاء العامة
window.addEventListener('error', () => {
  utils.showNotification('حدث خطأ غير متوقع', 'error');
});
window.addEventListener('unhandledrejection', () => {
  utils.showNotification('حدث خطأ في المعالجة', 'error');
});
// مثال على صندوق الحالة
const statusEl = document.getElementById('status');
statusEl.classList.add('animate-success');
setTimeout(() => {
  statusEl.classList.remove('animate-success');
}, 900);

// أو لصندوق الكتابة:
const inputEl = document.getElementById('message');
inputEl.classList.add('animate-success');
setTimeout(() => {
  inputEl.classList.remove('animate-success');
}, 900);

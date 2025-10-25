
        class LuxuryTodoApp {
            constructor() {
                this.currentDate = new Date();
                this.currentDate.setHours(0, 0, 0, 0);
                this.selectedDate = new Date(this.currentDate);
                this.currentCalendarDate = new Date(this.currentDate);
                this.tasks = {}; // { 'YYYY-MM-DD': [{ id, text, completed }] }
                this.taskIdCounter = 1;
                this.saveTimer = null;
                this.syncStatus = 'local';
                this.expandedItems = new Set(); // Track expanded list items
                this.copiedTasks = []; // Store copied tasks
                
                // GitHub sync settings
                this.githubToken = '';
                this.gistId = '';
                this.syncEnabled = false;
                
                this.init();
            }

            init() {
                this.loadSettings();
                this.loadData();
                this.bindEvents();
                this.initializeDragAndDrop();
                this.renderCalendar();
                this.renderTodayTasks();
                this.renderListScreen();
                this.updateDateDisplay();
                this.startPeriodicSync();
            }

            // Settings Management
            loadSettings() {
                try {
                    const settings = localStorage.getItem('meridianSyncSettings');
                    if (settings) {
                        const parsed = JSON.parse(settings);
                        this.githubToken = parsed.githubToken || '';
                        this.gistId = parsed.gistId || '';
                        this.syncEnabled = !!(this.githubToken);
                        
                        if (this.syncEnabled) {
                            this.updateSyncStatus('syncing', 'GitHub同期有効');
                        } else {
                            this.updateSyncStatus('local', 'ローカルモード');
                        }
                    }
                } catch (error) {
                    console.warn('Could not load sync settings:', error);
                    this.updateSyncStatus('local', 'ローカルモード');
                }
            }

            saveSettings() {
                const token = document.getElementById('github-token').value.trim();
                const gistId = document.getElementById('gist-id').value.trim();
                
                if (!token) {
                    alert('GitHub Personal Access Tokenを入力してください');
                    return;
                }
                
                this.githubToken = token;
                this.gistId = gistId;
                this.syncEnabled = true;
                
                const settings = {
                    githubToken: this.githubToken,
                    gistId: this.gistId
                };
                
                localStorage.setItem('meridianSyncSettings', JSON.stringify(settings));
                this.hideSettings();
                
                // Initial sync
                this.syncToGitHub();
            }

            showSettings() {
                document.getElementById('github-token').value = this.githubToken;
                document.getElementById('gist-id').value = this.gistId;
                document.getElementById('settings-modal').classList.add('active');
            }

            hideSettings() {
                document.getElementById('settings-modal').classList.remove('active');
            }

            // Data Management & Sync
            async loadData() {
                try {
                    // Always try to load from GitHub first if sync is enabled
                    if (this.syncEnabled) {
                        await this.loadFromGitHub();
                    } else {
                        // Load from localStorage
                        const savedData = localStorage.getItem('meridianTodoData');
                        if (savedData) {
                            const data = JSON.parse(savedData);
                            this.tasks = data.tasks || {};
                            this.taskIdCounter = data.taskIdCounter || 1;
                            this.updateSyncStatus('saved', 'データを読み込みました');
                        }
                    }
                } catch (error) {
                    console.warn('Could not load data:', error);
                    this.updateSyncStatus('error', '読み込みに失敗しました');
                }
            }

            // Refresh data from GitHub
            async refreshFromGitHub() {
                if (!this.syncEnabled) return;
                
                try {
                    await this.loadFromGitHub();
                    this.renderTodayTasks();
                    this.renderCalendar();
                    this.renderListScreen();
                } catch (error) {
                    console.warn('Could not refresh from GitHub:', error);
                }
            }

            async loadFromGitHub() {
                if (!this.syncEnabled) return;

                try {
                    this.updateSyncStatus('syncing', 'GitHubから同期中...');
                    
                    let url;
                    if (this.gistId) {
                        url = `https://api.github.com/gists/${this.gistId}`;
                    } else {
                        // Find existing gist
                        const gistsUrl = 'https://api.github.com/gists';
                        const gistsResponse = await fetch(gistsUrl, {
                            headers: {
                                'Authorization': `Bearer ${this.githubToken}`,
                                'Accept': 'application/vnd.github+json'
                            }
                        });
                        
                        if (gistsResponse.ok) {
                            const gists = await gistsResponse.json();
                            const meridianGist = gists.find(g => 
                                g.files['meridian-todo-data.json'] || 
                                g.description === 'Meridian Todo App Data'
                            );
                            
                            if (meridianGist) {
                                this.gistId = meridianGist.id;
                                url = `https://api.github.com/gists/${this.gistId}`;
                            }
                        }
                    }

                    if (url) {
                        const response = await fetch(url, {
                            headers: {
                                'Authorization': `Bearer ${this.githubToken}`,
                                'Accept': 'application/vnd.github+json'
                            }
                        });

                        if (response.ok) {
                            const gist = await response.json();
                            const dataFile = gist.files['meridian-todo-data.json'];
                            if (dataFile) {
                                const data = JSON.parse(dataFile.content);
                                this.tasks = data.tasks || {};
                                this.taskIdCounter = data.taskIdCounter || 1;
                                this.updateSyncStatus('saved', 'GitHubから同期完了');
                                return;
                            }
                        }
                    }
                    
                    // If no gist found, load from localStorage
                    const savedData = localStorage.getItem('meridianTodoData');
                    if (savedData) {
                        const data = JSON.parse(savedData);
                        this.tasks = data.tasks || {};
                        this.taskIdCounter = data.taskIdCounter || 1;
                    }
                    
                } catch (error) {
                    console.error('GitHub sync error:', error);
                    this.updateSyncStatus('error', 'GitHub同期エラー');
                    
                    // Fallback to localStorage
                    const savedData = localStorage.getItem('meridianTodoData');
                    if (savedData) {
                        const data = JSON.parse(savedData);
                        this.tasks = data.tasks || {};
                        this.taskIdCounter = data.taskIdCounter || 1;
                    }
                }
            }

            async syncToGitHub() {
                if (!this.syncEnabled) return;

                try {
                    this.updateSyncStatus('syncing', 'GitHubに同期中...');
                    
                    const data = {
                        tasks: this.tasks,
                        taskIdCounter: this.taskIdCounter,
                        lastSync: new Date().toISOString(),
                        version: '1.0'
                    };

                    const gistData = {
                        description: 'Meridian Todo App Data',
                        public: false,
                        files: {
                            'meridian-todo-data.json': {
                                content: JSON.stringify(data, null, 2)
                            }
                        }
                    };

                    let url = 'https://api.github.com/gists';
                    let method = 'POST';
                    
                    if (this.gistId) {
                        url = `https://api.github.com/gists/${this.gistId}`;
                        method = 'PATCH';
                    }

                    const response = await fetch(url, {
                        method: method,
                        headers: {
                            'Authorization': `Bearer ${this.githubToken}`,
                            'Accept': 'application/vnd.github+json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(gistData)
                    });

                    if (response.ok) {
                        const result = await response.json();
                        if (!this.gistId) {
                            this.gistId = result.id;
                            // Save the gist ID
                            const settings = {
                                githubToken: this.githubToken,
                                gistId: this.gistId
                            };
                            localStorage.setItem('meridianSyncSettings', JSON.stringify(settings));
                        }
                        
                        this.updateSyncStatus('saved', 'GitHubに同期完了');
                        setTimeout(() => {
                            if (this.syncStatus === 'saved') {
                                this.updateSyncStatus('syncing', 'GitHub同期有効');
                            }
                        }, 3000);
                    } else {
                        throw new Error(`GitHub API error: ${response.status}`);
                    }
                    
                } catch (error) {
                    console.error('GitHub sync error:', error);
                    this.updateSyncStatus('error', 'GitHub同期エラー');
                    setTimeout(() => {
                        if (this.syncStatus === 'error') {
                            this.updateSyncStatus('syncing', 'GitHub同期有効');
                        }
                    }, 5000);
                }
            }

            saveData() {
                try {
                    this.updateSyncStatus('saving', '保存中...');
                    
                    const data = {
                        tasks: this.tasks,
                        taskIdCounter: this.taskIdCounter,
                        lastSync: new Date().toISOString(),
                        version: '1.0'
                    };
                    
                    // Always save to localStorage as backup
                    localStorage.setItem('meridianTodoData', JSON.stringify(data));
                    
                    // Sync to GitHub if enabled
                    if (this.syncEnabled) {
                        this.syncToGitHub();
                    } else {
                        // Simulate sync delay for user feedback
                        setTimeout(() => {
                            this.updateSyncStatus('saved', '保存しました');
                            setTimeout(() => {
                                this.updateSyncStatus('local', 'ローカルモード');
                            }, 2000);
                        }, 300);
                    }
                    
                } catch (error) {
                    console.error('Could not save data:', error);
                    this.updateSyncStatus('error', '保存に失敗しました');
                    
                    // Fallback to cookie if localStorage fails
                    try {
                        const fallbackData = JSON.stringify(data);
                        if (fallbackData.length < 4000) { // Cookie size limit
                            document.cookie = `meridianTodoFallback=${encodeURIComponent(fallbackData)};expires=${new Date(Date.now() + 365*24*60*60*1000).toUTCString()};path=/`;
                        }
                    } catch (fallbackError) {
                        console.error('Fallback save also failed:', fallbackError);
                    }
                }
            }

            updateSyncStatus(status, text) {
                this.syncStatus = status;
                const statusEl = document.getElementById('sync-status');
                const spinnerEl = document.getElementById('sync-spinner');
                const textEl = document.getElementById('sync-text');
                
                statusEl.className = `sync-status ${status}`;
                textEl.textContent = text;
                
                if (status === 'syncing' || status === 'saving') {
                    spinnerEl.style.display = 'block';
                } else {
                    spinnerEl.style.display = 'none';
                }
            }

            startPeriodicSync() {
                // Auto-sync more frequently for better synchronization
                setInterval(() => {
                    if (this.syncStatus !== 'syncing' && this.syncEnabled) {
                        this.refreshFromGitHub();
                    } else if (!this.syncEnabled && this.syncStatus !== 'saving') {
                        // Auto-save locally every 30 seconds
                        this.saveData();
                    }
                }, this.syncEnabled ? 60000 : 30000); // 1 minute for GitHub sync, 30 seconds for local
            }

            // Drag and drop functionality
            initializeDragAndDrop() {
                let draggedElement = null;
                let draggedData = null;

                document.addEventListener('dragstart', (e) => {
                    if (e.target.classList.contains('task-item')) {
                        draggedElement = e.target;
                        draggedData = {
                            dateStr: e.target.dataset.date,
                            taskId: parseInt(e.target.dataset.taskId)
                        };
                        e.target.classList.add('dragging');
                        e.dataTransfer.effectAllowed = 'move';
                    }
                });

                document.addEventListener('dragend', (e) => {
                    if (e.target.classList.contains('task-item')) {
                        e.target.classList.remove('dragging');
                        document.querySelectorAll('.task-item').forEach(item => {
                            item.classList.remove('drag-over');
                        });
                        draggedElement = null;
                        draggedData = null;
                    }
                });

                document.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    
                    if (e.target.closest('.task-item') && draggedElement) {
                        const targetElement = e.target.closest('.task-item');
                        if (targetElement !== draggedElement) {
                            // Remove drag-over class from all items
                            document.querySelectorAll('.task-item').forEach(item => {
                                item.classList.remove('drag-over');
                            });
                            // Add drag-over class to target
                            targetElement.classList.add('drag-over');
                        }
                    }
                });

                document.addEventListener('drop', (e) => {
                    e.preventDefault();
                    
                    const targetElement = e.target.closest('.task-item');
                    if (targetElement && draggedElement && targetElement !== draggedElement && draggedData) {
                        const targetDateStr = targetElement.dataset.date;
                        const targetTaskId = parseInt(targetElement.dataset.taskId);
                        
                        // Only allow reordering within the same date
                        if (draggedData.dateStr === targetDateStr) {
                            this.reorderTask(draggedData.dateStr, draggedData.taskId, targetTaskId);
                        }
                    }
                    
                    // Clean up
                    document.querySelectorAll('.task-item').forEach(item => {
                        item.classList.remove('drag-over');
                    });
                });
            }

            triggerSave() {
                clearTimeout(this.saveTimer);
                this.saveTimer = setTimeout(() => {
                    this.saveData();
                }, 1000); // Debounce saves
            }

            bindEvents() {
                // Navigation - 修正：e.currentTargetを使用
                document.querySelectorAll('.nav-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        // e.currentTargetでボタン要素自体を取得
                        const targetBtn = e.currentTarget;
                        const screen = targetBtn.dataset.screen;
                        
                        // screenが有効な値かチェック
                        if (screen) {
                            this.switchScreen(screen);
                        }
                    });
                });

                // Calendar navigation
                document.getElementById('prev-month').addEventListener('click', () => {
                    this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() - 1);
                    this.renderCalendar();
                });

                document.getElementById('next-month').addEventListener('click', () => {
                    this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + 1);
                    this.renderCalendar();
                });

                // Modal calendar navigation
                document.getElementById('modal-prev-month').addEventListener('click', () => {
                    this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() - 1);
                    this.renderModalCalendar();
                });

                document.getElementById('modal-next-month').addEventListener('click', () => {
                    this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + 1);
                    this.renderModalCalendar();
                });

                // Add task
                document.getElementById('add-task-btn').addEventListener('click', () => {
                    this.addTask();
                });

                document.getElementById('new-task-input').addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.addTask();
                    }
                });

                // Mobile calendar modal
                document.getElementById('mobile-date-trigger').addEventListener('click', () => {
                    this.showCalendarModal();
                });

                document.getElementById('close-modal').addEventListener('click', () => {
                    this.hideCalendarModal();
                });

                document.getElementById('calendar-modal').addEventListener('click', (e) => {
                    if (e.target.id === 'calendar-modal') {
                        this.hideCalendarModal();
                    }
                });

                // Settings modal
                document.getElementById('settings-modal').addEventListener('click', (e) => {
                    if (e.target.id === 'settings-modal') {
                        this.hideSettings();
                    }
                });

                // Auto-save before page unload
                window.addEventListener('beforeunload', () => {
                    this.saveData();
                });

                // Sync when page becomes visible (user returns from another tab/app)
                document.addEventListener('visibilitychange', () => {
                    if (!document.hidden && this.syncEnabled) {
                        this.refreshFromGitHub();
                    }
                });

                // Sync when window gains focus
                window.addEventListener('focus', () => {
                    if (this.syncEnabled) {
                        this.refreshFromGitHub();
                    }
                });
            }

            switchScreen(screen) {
                // screenパラメータの妥当性チェックを追加
                if (!screen || (screen !== 'top' && screen !== 'list')) {
                    console.warn('Invalid screen parameter:', screen);
                    return;
                }

                document.querySelectorAll('.nav-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                
                // より安全な要素選択
                const targetBtn = document.querySelector(`[data-screen="${screen}"]`);
                if (targetBtn) {
                    targetBtn.classList.add('active');
                }

                document.querySelectorAll('.screen').forEach(s => {
                    s.classList.remove('active');
                });
                
                const targetScreen = document.getElementById(`${screen}-screen`);
                if (targetScreen) {
                    targetScreen.classList.add('active');
                }

                if (screen === 'list') {
                    this.renderListScreen();
                }
            }

            formatDate(date) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }

            formatDisplayDate(date) {
                const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const month = date.getMonth() + 1;
                const day = date.getDate();
                const dayOfWeek = days[date.getDay()];
                return `${month}/${day} (${dayOfWeek})`;
            }

            formatDisplayDateForList(date) {
                const days = ['日', '月', '火', '水', '木', '金', '土'];
                const month = date.getMonth() + 1;
                const day = date.getDate();
                const dayOfWeek = days[date.getDay()];
                return `${month}/${day}(${dayOfWeek})`;
            }

            updateDateDisplay() {
                const displayDate = this.formatDisplayDate(this.selectedDate);
                const displayDateJapanese = this.formatDisplayDateForList(this.selectedDate);
                document.getElementById('today-title').textContent = `${displayDateJapanese} Today's Tasks`;
                document.getElementById('mobile-current-date').textContent = displayDate;
            }

            renderCalendar(modal = false) {
                const container = modal ? 'modal-calendar-dates' : 'calendar-dates';
                const titleContainer = modal ? 'modal-calendar-title' : null;
                
                const year = this.currentCalendarDate.getFullYear();
                const month = this.currentCalendarDate.getMonth();
                
                if (titleContainer) {
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    document.getElementById(titleContainer).textContent = `${monthNames[month]} ${year}`;
                }

                const firstDay = new Date(year, month, 1);
                const lastDay = new Date(year, month + 1, 0);
                const firstDayOfWeek = firstDay.getDay();
                const daysInMonth = lastDay.getDate();

                let html = '';

                // Previous month's trailing days
                const prevMonth = new Date(year, month - 1, 0);
                for (let i = firstDayOfWeek - 1; i >= 0; i--) {
                    const day = prevMonth.getDate() - i;
                    html += `<div class="calendar-date other-month">${day}</div>`;
                }

                // Current month's days
                for (let day = 1; day <= daysInMonth; day++) {
                    const date = new Date(year, month, day);
                    const dateStr = this.formatDate(date);
                    const isToday = this.formatDate(date) === this.formatDate(this.currentDate);
                    const isCompleted = this.isDateCompleted(dateStr);
                    
                    let classes = 'calendar-date';
                    if (isToday) classes += ' today';
                    if (isCompleted) classes += ' completed';

                    html += `<div class="${classes}" data-date="${dateStr}" onclick="app.selectDate('${dateStr}')">${day}</div>`;
                }

                // Next month's leading days
                const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;
                const remainingCells = totalCells - (firstDayOfWeek + daysInMonth);
                for (let day = 1; day <= remainingCells; day++) {
                    html += `<div class="calendar-date other-month">${day}</div>`;
                }

                document.getElementById(container).innerHTML = html;
            }

            renderModalCalendar() {
                this.renderCalendar(true);
            }

            showCalendarModal() {
                document.getElementById('calendar-modal').classList.add('active');
                this.renderModalCalendar();
            }

            hideCalendarModal() {
                document.getElementById('calendar-modal').classList.remove('active');
            }

            selectDate(dateStr) {
                this.selectedDate = new Date(dateStr + 'T00:00:00');
                this.updateDateDisplay();
                this.renderTodayTasks();
                this.hideCalendarModal();
                
                // Switch to top screen if on list screen
                if (document.getElementById('list-screen').classList.contains('active')) {
                    this.switchScreen('top');
                }
            }

            isDateCompleted(dateStr) {
                const tasks = this.tasks[dateStr] || [];
                return tasks.length > 0 && tasks.every(task => task.completed);
            }

            addTask() {
                const input = document.getElementById('new-task-input');
                const text = input.value.trim();
                
                if (!text) return;

                const dateStr = this.formatDate(this.selectedDate);
                if (!this.tasks[dateStr]) {
                    this.tasks[dateStr] = [];
                }

                this.tasks[dateStr].push({
                    id: this.taskIdCounter++,
                    text: text,
                    completed: false
                });

                input.value = '';
                this.renderTodayTasks();
                this.renderCalendar();
                this.renderListScreen();
                this.triggerSave();
            }

            toggleTask(dateStr, taskId) {
                const tasks = this.tasks[dateStr] || [];
                const task = tasks.find(t => t.id === taskId);
                if (task) {
                    task.completed = !task.completed;
                    this.renderTodayTasks();
                    this.renderCalendar();
                    this.renderListScreen();
                    this.triggerSave();
                }
            }

            deleteTask(dateStr, taskId) {
                if (this.tasks[dateStr]) {
                    this.tasks[dateStr] = this.tasks[dateStr].filter(t => t.id !== taskId);
                    if (this.tasks[dateStr].length === 0) {
                        delete this.tasks[dateStr];
                    }
                    this.renderTodayTasks();
                    this.renderCalendar();
                    this.renderListScreen();
                    this.triggerSave();
                }
            }

            editTask(dateStr, taskId, newText) {
                const tasks = this.tasks[dateStr] || [];
                const task = tasks.find(t => t.id === taskId);
                if (task && newText.trim()) {
                    task.text = newText.trim();
                    this.renderTodayTasks();
                    this.renderListScreen();
                    this.triggerSave();
                }
            }

            copyTaskToNextDay(dateStr, taskId) {
                const tasks = this.tasks[dateStr] || [];
                const task = tasks.find(t => t.id === taskId);
                if (!task) return;

                const currentDate = new Date(dateStr + 'T00:00:00');
                const nextDate = new Date(currentDate);
                nextDate.setDate(nextDate.getDate() + 1);
                const nextDateStr = this.formatDate(nextDate);

                if (!this.tasks[nextDateStr]) {
                    this.tasks[nextDateStr] = [];
                }

                this.tasks[nextDateStr].push({
                    id: this.taskIdCounter++,
                    text: task.text,
                    completed: false
                });

                this.renderTodayTasks();
                this.renderListScreen();
                this.triggerSave();
            }

            renderTodayTasks() {
                const dateStr = this.formatDate(this.selectedDate);
                const tasks = this.tasks[dateStr] || [];
                const container = document.getElementById('today-tasks');
                const copyAllSection = document.getElementById('copy-all-section');

                // Show/hide copy all section based on whether there are tasks
                if (tasks.length > 0) {
                    copyAllSection.style.display = 'flex';
                } else {
                    copyAllSection.style.display = 'none';
                }

                if (tasks.length === 0) {
                    container.innerHTML = '<div style="text-align: center; color: #666; padding: 40px; font-size: 14px;">タスクがありません</div>';
                    return;
                }

                const html = tasks.map(task => `
                    <div class="task-item" draggable="true" data-date="${dateStr}" data-task-id="${task.id}">
                        <div class="drag-handle">⋮⋮</div>
                        <div class="task-checkbox ${task.completed ? 'checked' : ''}" 
                             onclick="app.toggleTask('${dateStr}', ${task.id})">
                            ${task.completed ? '✓' : ''}
                        </div>
                        <div class="task-text ${task.completed ? 'completed' : ''}" 
                             onclick="app.startEditTask(this, '${dateStr}', ${task.id})"
                             data-original="${task.text}">${task.text}</div>
                        <div class="task-actions">
                            <button class="delete-btn" onclick="app.deleteTask('${dateStr}', ${task.id})">削除</button>
                        </div>
                    </div>
                `).join('');

                container.innerHTML = html;
            }

            startEditTask(element, dateStr, taskId) {
                if (element.classList.contains('editing')) return;

                const originalText = element.dataset.original;
                element.classList.add('editing');
                element.contentEditable = true;
                element.focus();

                const finishEdit = () => {
                    element.classList.remove('editing');
                    element.contentEditable = false;
                    const newText = element.textContent.trim();
                    
                    if (newText && newText !== originalText) {
                        this.editTask(dateStr, taskId, newText);
                    } else {
                        element.textContent = originalText;
                    }
                };

                element.addEventListener('blur', finishEdit, { once: true });
                element.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        element.blur();
                    }
                }, { once: true });
            }

            renderListScreen() {
                const container = document.getElementById('list-container');
                const today = new Date(this.currentDate);
                
                let html = '';
                
                // Generate dates for the next year
                for (let i = 0; i < 365; i++) {
                    const date = new Date(today);
                    date.setDate(date.getDate() + i);
                    const dateStr = this.formatDate(date);
                    const displayDate = this.formatDisplayDateForList(date);
                    const tasks = this.tasks[dateStr] || [];
                    
                    // Add a label for today, tomorrow, etc.
                    let label = '';
                    if (i === 0) label = ' のタスク';
                    else if (i === 1) label = ' のタスク';
                    else label = ' のタスク';
                    
                    const isExpanded = this.expandedItems.has(dateStr);
                    
                    html += `
                        <div class="list-item ${isExpanded ? 'expanded' : ''}" data-date="${dateStr}">
                            <div class="list-item-header" onclick="app.toggleListItem(this)">
                                <div class="list-item-title">${displayDate}${label}</div>
                                <div class="list-item-indicator"></div>
                            </div>
                            <div class="list-item-content">
                                <div class="task-list">
                                    ${tasks.length === 0 ? 
                                        '<div style="text-align: center; color: #666; padding: 20px; font-size: 14px;">タスクがありません</div>' :
                                        tasks.map(task => `
                                            <div class="task-item" draggable="true" data-date="${dateStr}" data-task-id="${task.id}">
                                                <div class="drag-handle">⋮⋮</div>
                                                <div class="task-checkbox ${task.completed ? 'checked' : ''}" 
                                                     onclick="app.toggleTask('${dateStr}', ${task.id})">
                                                    ${task.completed ? '✓' : ''}
                                                </div>
                                                <div class="task-text ${task.completed ? 'completed' : ''}" 
                                                     onclick="app.startEditTask(this, '${dateStr}', ${task.id})"
                                                     data-original="${task.text}">${task.text}</div>
                                                <div class="task-actions">
                                                    <button class="delete-btn" onclick="app.deleteTask('${dateStr}', ${task.id})">Delete</button>
                                                </div>
                                            </div>
                                        `).join('')
                                    }
                                </div>
                                <div class="add-task">
                                    <div class="add-task-form">
                                        <input type="text" class="add-task-input" placeholder="新しいタスク" 
                                               onkeypress="if(event.key==='Enter') app.addTaskToDate('${dateStr}', this)">
                                        <button class="add-task-btn" onclick="app.addTaskToDate('${dateStr}', this.previousElementSibling)">追加</button>
                                        <button class="paste-btn" onclick="app.pasteTasksToDate('${dateStr}')" 
                                                id="paste-btn-${dateStr}" 
                                                ${this.copiedTasks.length === 0 ? 'disabled' : ''}>貼り付け</button>
                                        ${tasks.length > 0 ? `<button class="clear-all-btn" onclick="app.clearAllTasksForDate('${dateStr}')">一括削除</button>` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }
                
                container.innerHTML = html;
            }

            toggleListItem(header) {
                const listItem = header.parentElement;
                const dateStr = listItem.dataset.date;
                
                if (this.expandedItems.has(dateStr)) {
                    this.expandedItems.delete(dateStr);
                    listItem.classList.remove('expanded');
                } else {
                    this.expandedItems.add(dateStr);
                    listItem.classList.add('expanded');
                }
            }

            copyAllTasks() {
                const currentDateStr = this.formatDate(this.selectedDate);
                const currentTasks = this.tasks[currentDateStr] || [];
                
                if (currentTasks.length === 0) {
                    this.showTemporaryMessage('コピーするタスクがありません');
                    return;
                }

                // Copy tasks to clipboard
                this.copiedTasks = currentTasks.map(task => ({
                    text: task.text,
                    completed: false // Always copy as uncompleted
                }));

                this.showTemporaryMessage(`${this.copiedTasks.length}個のタスクをコピーしました`);
                this.updatePasteButtons();
            }

            clearAllTasks() {
                const currentDateStr = this.formatDate(this.selectedDate);
                const currentTasks = this.tasks[currentDateStr] || [];
                
                if (currentTasks.length === 0) {
                    this.showTemporaryMessage('削除するタスクがありません');
                    return;
                }

                // Confirm before deleting
                const confirmMessage = `${currentTasks.length}個のタスクを削除しますか？この操作は元に戻せません。`;
                if (confirm(confirmMessage)) {
                    const taskCount = currentTasks.length;
                    delete this.tasks[currentDateStr];
                    
                    this.showTemporaryMessage(`${taskCount}個のタスクを削除しました`);
                    
                    this.renderTodayTasks();
                    this.renderCalendar();
                    this.renderListScreen();
                    this.triggerSave();
                }
            }

            clearAllTasksForDate(dateStr) {
                const tasks = this.tasks[dateStr] || [];
                
                if (tasks.length === 0) {
                    this.showTemporaryMessage('削除するタスクがありません');
                    return;
                }

                const targetDate = new Date(dateStr + 'T00:00:00');
                const displayDate = this.formatDisplayDateForList(targetDate);
                const confirmMessage = `${displayDate}の${tasks.length}個のタスクを削除しますか？この操作は元に戻せません。`;
                
                if (confirm(confirmMessage)) {
                    const taskCount = tasks.length;
                    delete this.tasks[dateStr];
                    
                    this.showTemporaryMessage(`${displayDate}の${taskCount}個のタスクを削除しました`);
                    
                    this.renderListScreen();
                    this.renderCalendar();
                    if (dateStr === this.formatDate(this.selectedDate)) {
                        this.renderTodayTasks();
                    }
                    this.triggerSave();
                }
            }

            pasteTasksToDate(dateStr) {
                if (this.copiedTasks.length === 0) {
                    this.showTemporaryMessage('コピーされたタスクがありません');
                    return;
                }

                if (!this.tasks[dateStr]) {
                    this.tasks[dateStr] = [];
                }

                // Paste all copied tasks
                this.copiedTasks.forEach(task => {
                    this.tasks[dateStr].push({
                        id: this.taskIdCounter++,
                        text: task.text,
                        completed: false
                    });
                });

                const targetDate = new Date(dateStr + 'T00:00:00');
                const targetDisplayDate = this.formatDisplayDateForList(targetDate);
                this.showTemporaryMessage(`${this.copiedTasks.length}個のタスクを${targetDisplayDate}に貼り付けました`);

                this.renderListScreen();
                this.renderCalendar();
                if (dateStr === this.formatDate(this.selectedDate)) {
                    this.renderTodayTasks();
                }
                this.triggerSave();
            }

            updatePasteButtons() {
                // Update all paste buttons
                const pasteButtons = document.querySelectorAll('[id^="paste-btn-"]');
                pasteButtons.forEach(btn => {
                    btn.disabled = this.copiedTasks.length === 0;
                });
            }

            showTemporaryMessage(message) {
                const messageEl = document.createElement('div');
                messageEl.style.cssText = `
                    position: fixed;
                    top: 80px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #000;
                    color: white;
                    padding: 12px 20px;
                    border-radius: 50px;
                    font-size: 14px;
                    z-index: 2000;
                    opacity: 0;
                    transition: opacity 0.3s;
                    text-align: center;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                `;
                messageEl.textContent = message;
                document.body.appendChild(messageEl);

                // Fade in
                setTimeout(() => {
                    messageEl.style.opacity = '1';
                }, 10);

                // Fade out and remove
                setTimeout(() => {
                    messageEl.style.opacity = '0';
                    setTimeout(() => {
                        document.body.removeChild(messageEl);
                    }, 300);
                }, 2000);
            }

            addTaskToDate(dateStr, inputElement) {
                const text = inputElement.value.trim();
                if (!text) return;

                if (!this.tasks[dateStr]) {
                    this.tasks[dateStr] = [];
                }

                this.tasks[dateStr].push({
                    id: this.taskIdCounter++,
                    text: text,
                    completed: false
                });

                inputElement.value = '';
                this.renderListScreen();
                this.renderCalendar();
                
                // Update today tasks if it's the selected date
                if (dateStr === this.formatDate(this.selectedDate)) {
                    this.renderTodayTasks();
                }
                
                this.triggerSave();
            }
            reorderTask(dateStr, draggedTaskId, targetTaskId) {
    const tasks = this.tasks[dateStr];
    if (!tasks) return;
    
    // Find the indices of the dragged and target tasks
    const draggedIndex = tasks.findIndex(t => t.id === draggedTaskId);
    const targetIndex = tasks.findIndex(t => t.id === targetTaskId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Remove the dragged task from its current position
    const [draggedTask] = tasks.splice(draggedIndex, 1);
    
    // Insert it at the new position
    // If we're moving down, we need to adjust the target index
    const newTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    tasks.splice(newTargetIndex, 0, draggedTask);
    
    // Re-render and save
    this.renderTodayTasks();
    this.renderListScreen();
    this.triggerSave();
}
        }

        // Initialize the app
        const app = new LuxuryTodoApp();

        // Make functions globally accessible for onclick handlers
        window.app = app;

// js/ui/welcome.js
window.App = window.App || {};

App.welcomeCurrentStep = 1;
App.welcomeTotalSteps = 4;

App.showWelcomeModal = function() {
    App.welcomeCurrentStep = 1;
    App.elements.welcomeBackdrop?.classList.remove('hidden');
    App.elements.welcomeModal?.classList.remove('hidden');
    App.updateWelcomeStep();
};

App.closeWelcomeModal = function() {
    App.elements.welcomeBackdrop?.classList.add('hidden');
    App.elements.welcomeModal?.classList.add('hidden');
    // Отмечаем, что пользователь прошёл онбординг
    try {
        localStorage.setItem('rtasks_welcomed', 'true');
    } catch (e) { /* игнорируем */
    }
};

App.updateWelcomeStep = function() {
    // Скрываем все шаги
    document.querySelectorAll('#welcomeModal .welcome-step').forEach(step => {
        step.classList.remove('active');
    });
    // Показываем текущий шаг
    const currentStep = document.querySelector(`#welcomeModal .welcome-step[data-step="${App.welcomeCurrentStep}"]`);
    if (currentStep) currentStep.classList.add('active');

    // Обновляем прогресс-бар
    document.querySelectorAll('#welcomeModal .welcome-progress-dot').forEach(dot => {
        const dotStep = parseInt(dot.dataset.dot);
        dot.classList.toggle('active', dotStep === App.welcomeCurrentStep);
    });

    // Обновляем кнопки
    const prevBtn = document.getElementById('welcomePrev');
    const nextBtn = document.getElementById('welcomeNext');
    if (prevBtn) prevBtn.style.display = App.welcomeCurrentStep === 1 ? 'none' : 'inline-flex';
    if (nextBtn) nextBtn.textContent = App.welcomeCurrentStep === App.welcomeTotalSteps ? 'Начать работу' : 'Далее';
};

App.welcomeNext = function() {
    if (App.welcomeCurrentStep < App.welcomeTotalSteps) {
        App.welcomeCurrentStep++;
        App.updateWelcomeStep();
    } else {
        App.closeWelcomeModal();
    }
};

App.welcomePrev = function() {
    if (App.welcomeCurrentStep > 1) {
        App.welcomeCurrentStep--;
        App.updateWelcomeStep();
    }
};

App.toggleShortcutsHelp = function() {
    if (App.ui.shortcutsHelpOpen) App.closeShortcutsHelp();
    else App.showShortcutsHelp();
};

App.showShortcutsHelp = function() {
    App.ui.shortcutsHelpOpen = true;
    App.ui.lastFocusedElement = document.activeElement;
    App.elements.shortcutsBackdrop.classList.remove('hidden');
    App.elements.shortcutsHelp.classList.add('active');
    setTimeout(() => App.elements.shortcutsClose.focus(), 100);
};

App.closeShortcutsHelp = function() {
    App.ui.shortcutsHelpOpen = false;
    App.elements.shortcutsBackdrop.classList.add('hidden');
    App.elements.shortcutsHelp.classList.remove('active');
    if (App.ui.lastFocusedElement) App.ui.lastFocusedElement.focus();
};

/**
 * Привязывает обработчики приветственного онбординга (welcome modal).
 * Элементы опциональны — модалка может отсутствовать в DOM в некоторых сборках.
 * Вынесено из core/bindEvents.js для декомпозиции God Function.
 */
App.bindWelcomeEvents = function() {
    if (App.elements.welcomeClose) {
        App.elements.welcomeClose.addEventListener('click', () => App.closeWelcomeModal());
    }
    if (App.elements.welcomeSkip) {
        App.elements.welcomeSkip.addEventListener('click', () => App.closeWelcomeModal());
    }
    if (App.elements.welcomePrev) {
        App.elements.welcomePrev.addEventListener('click', () => App.welcomePrev());
    }
    if (App.elements.welcomeNext) {
        App.elements.welcomeNext.addEventListener('click', () => App.welcomeNext());
    }
    if (App.elements.welcomeBackdrop) {
        App.elements.welcomeBackdrop.addEventListener('click', () => App.closeWelcomeModal());
    }
};

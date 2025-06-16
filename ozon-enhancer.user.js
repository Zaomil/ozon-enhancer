// ==UserScript==
// @name          Ozon Interface Enhancer
// @namespace     https://github.com/Zaomil
// @version       1.0.3
// @description   Улучшает интерфейс Ozon: сортирует отзывы от худших к лучшим, автоматически раскрывает описание товаров
// @author        Zaomil
// @license       MIT
// @icon          https://ozon.by/favicon.ico
// @match         https://*.ozon.by/*
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_addStyle
// @run-at        document-idle
// @homepageURL   https://github.com/Zaomil/ozon-enhancer
// @supportURL    https://github.com/Zaomil/ozon-enhancer/issues
// ==/UserScript==

(function() {
    'use strict';

    // Конфигурация по умолчанию
    const DEFAULT_CONFIG = {
        sortReviews: true,
        expandDescription: true
    };

    // Управление настройками через Storage
    const CONFIG = {
        get sortReviews() {
            return GM_getValue('sortReviews', DEFAULT_CONFIG.sortReviews);
        },
        set sortReviews(value) {
            GM_setValue('sortReviews', value);
        },
        get expandDescription() {
            return GM_getValue('expandDescription', DEFAULT_CONFIG.expandDescription);
        },
        set expandDescription(value) {
            GM_setValue('expandDescription', value);
        }
    };

    // Флаги состояния
    let isSortingApplied = false;
    let panelCreated = false;

    /**
     * Сортирует отзывы по возрастанию рейтинга
     * Добавляет параметр ?sort=score_asc в URL
     */
    function sortReviews() {
        if (!CONFIG.sortReviews || isSortingApplied) return;
        if (!location.pathname.includes('/product/')) return;

        const urlObj = new URL(location.href);
        const params = urlObj.searchParams;

        if (params.get('sort') !== 'score_asc') {
            params.set('sort', 'score_asc');
            history.replaceState(null, '', urlObj.toString());
            isSortingApplied = true;
            setTimeout(() => window.location.href = urlObj.toString(), 100);
        }
    }

    /**
     * Автоматически раскрывает описание товара
     * Ищет кнопки по тексту и CSS-селекторам
     */
    function expandDescription() {
        if (!CONFIG.expandDescription) return;
        try {
            const buttonTexts = ['Показать полностью', 'Развернуть описание', 'Читать полностью', 'Показать всё', 'Развернуть'];
            let found = false;

            // Поиск по тексту кнопки
            for (const btn of document.querySelectorAll('button, [role="button"]')) {
                const btnText = btn.textContent?.trim() || '';
                if (buttonTexts.some(text => btnText.includes(text)) &&
                    btn.offsetParent !== null &&
                    btn.getAttribute('aria-expanded') !== 'true') {
                    btn.click();
                    found = true;
                    break;
                }
            }

            // Резервный поиск по CSS-селекторам
            if (!found) {
                const classSelectors = [
                    '.ui-d0k',
                    '[data-widget="webDescription"] button',
                    '.description button',
                    '.info-section button',
                    '[class*="expandButton"]',
                    '[class*="showMore"]'
                ];

                for (const selector of classSelectors) {
                    const btn = document.querySelector(selector);
                    if (btn && btn.offsetParent !== null && btn.getAttribute('aria-expanded') !== 'true') {
                        btn.click();
                        found = true;
                        break;
                    }
                }
            }
        } catch (e) {
            console.error('OzonEnhancer: Ошибка раскрытия описания', e);
        }
    }

    /**
     * Создает панель управления с настройками
     * @returns {HTMLDivElement} Созданный элемент панели
     */
    function createControlPanel() {
        if (panelCreated) return;
        panelCreated = true;

        // Удаление существующей панели
        const existingPanel = document.getElementById('ozon-enhancer-panel');
        if (existingPanel) existingPanel.remove();

        const panel = document.createElement('div');
        panel.id = 'ozon-enhancer-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50px;
            right: 10px;
            background: #ffffff;
            border-radius: 12px;
            padding: 0;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            min-width: 300px;
            overflow: hidden;
            border: 1px solid #eaeaea;
        `;

        // Заголовок панели
        const header = document.createElement('div');
        header.textContent = 'Ozon Enhancer';
        header.style.cssText = `
            font-weight: 600;
            font-size: 18px;
            padding: 18px 20px;
            background: linear-gradient(135deg, #0066ff 0%, #0048cc 100%);
            color: white;
            display: flex;
            align-items: center;
            gap: 10px;
        `;

        const icon = document.createElement('div');
        icon.innerHTML = '⚡';
        icon.style.fontSize = '20px';
        header.prepend(icon);
        panel.appendChild(header);

        // Контейнер настроек
        const settingsContainer = document.createElement('div');
        settingsContainer.style.padding = '16px 20px';
        panel.appendChild(settingsContainer);

        // Переключатели
        settingsContainer.appendChild(createToggle(
            'Сортировать отзывы (от худших)',
            '📊',
            CONFIG.sortReviews,
            checked => {
                CONFIG.sortReviews = checked;
                if (checked) {
                    isSortingApplied = false;
                    sortReviews();
                }
            }
        ));

        settingsContainer.appendChild(createToggle(
            'Авто-раскрытие описания',
            '📝',
            CONFIG.expandDescription,
            checked => {
                CONFIG.expandDescription = checked;
                if (checked) expandDescription();
            }
        ));

        // Кнопка закрытия
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.title = 'Закрыть панель';
        closeBtn.style.cssText = `
            position: absolute;
            top: 14px;
            right: 14px;
            background: rgba(255,255,255,0.2);
            border: none;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: white;
            font-size: 20px;
            line-height: 1;
            transition: all 0.2s;
        `;
        closeBtn.addEventListener('mouseover', () => closeBtn.style.background = 'rgba(255,255,255,0.3)');
        closeBtn.addEventListener('mouseout', () => closeBtn.style.background = 'rgba(255,255,255,0.2)');
        closeBtn.addEventListener('click', () => {
            panel.remove();
            panelCreated = false;
        });
        header.appendChild(closeBtn);

        document.body.appendChild(panel);
        return panel;
    }

    /**
     * Создает элемент переключателя
     * @param {string} label - Текст подписи
     * @param {string} icon - Иконка для элемента
     * @param {boolean} checked - Начальное состояние
     * @param {Function} onChange - Обработчик изменения
     * @returns {HTMLDivElement} Созданный элемент переключателя
     */
    function createToggle(label, icon, checked, onChange) {
        const container = document.createElement('div');
        container.style.cssText = `
            display: flex;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid #f0f0f0;
        `;

        // Иконка
        const iconEl = document.createElement('div');
        iconEl.textContent = icon;
        iconEl.style.cssText = `
            font-size: 20px;
            margin-right: 12px;
            width: 24px;
            text-align: center;
        `;
        container.appendChild(iconEl);

        // Текст
        const textContainer = document.createElement('div');
        textContainer.style.flex = '1';

        const labelEl = document.createElement('div');
        labelEl.textContent = label;
        labelEl.style.cssText = `
            font-weight: 500;
            font-size: 15px;
            color: #333;
            margin-bottom: 2px;
        `;
        textContainer.appendChild(labelEl);
        container.appendChild(textContainer);

        // Переключатель
        const toggleContainer = document.createElement('label');
        toggleContainer.style.cssText = `
            position: relative;
            display: inline-block;
            width: 44px;
            height: 24px;
            flex-shrink: 0;
        `;

        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = checked;
        toggleInput.style.cssText = `
            opacity: 0;
            width: 0;
            height: 0;
        `;
        toggleInput.addEventListener('change', () => onChange(toggleInput.checked));

        const toggleSlider = document.createElement('span');
        toggleSlider.style.cssText = `
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 24px;
        `;

        const toggleKnob = document.createElement('span');
        toggleKnob.style.cssText = `
            position: absolute;
            content: "";
            height: 20px;
            width: 20px;
            left: 2px;
            bottom: 2px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        `;

        toggleSlider.appendChild(toggleKnob);
        toggleContainer.appendChild(toggleInput);
        toggleContainer.appendChild(toggleSlider);
        container.appendChild(toggleContainer);

        // Обновление стилей переключателя
        const updateToggleStyle = () => {
            if (toggleInput.checked) {
                toggleSlider.style.backgroundColor = '#0066ff';
                toggleKnob.style.transform = 'translateX(20px)';
            } else {
                toggleSlider.style.backgroundColor = '#ccc';
                toggleKnob.style.transform = 'translateX(0)';
            }
        };
        toggleInput.addEventListener('change', updateToggleStyle);
        updateToggleStyle();

        return container;
    }

    /**
     * Создает кнопку активации панели управления
     */
    function createPanelToggle() {
        if (document.getElementById('ozon-enhancer-toggle')) return;

        const toggle = document.createElement('button');
        toggle.id = 'ozon-enhancer-toggle';
        toggle.innerHTML = '⚡ Ozon Enhancer';
        toggle.addEventListener('click', createControlPanel);
        document.body.appendChild(toggle);
        return toggle;
    }

    // Инъекция стилей
    GM_addStyle(`
        #ozon-enhancer-panel {
            transition: all 0.3s ease;
            animation: fadeIn 0.3s ease-out;
        }

        #ozon-enhancer-toggle {
            position: fixed !important;
            top: 10px !important;
            right: 10px !important;
            background: #0066ff !important;
            color: white !important;
            border: none !important;
            border-radius: 6px !important;
            padding: 10px 16px !important;
            cursor: pointer !important;
            z-index: 2147483647 !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            box-shadow: 0 4px 12px rgba(0,102,255,0.3) !important;
            transition: all 0.2s ease !important;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        #ozon-enhancer-toggle:hover {
            background: #0052d9 !important;
            transform: translateY(-1px) !important;
            box-shadow: 0 6px 16px rgba(0,102,255,0.4) !important;
        }

        #ozon-enhancer-toggle:active {
            transform: translateY(0) !important;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `);

    // Отслеживание изменений URL
    const updateState = (type) => {
        const orig = history[type];
        return function() {
            const result = orig.apply(this, arguments);
            window.dispatchEvent(new Event('locationchange'));
            return result;
        };
    };

    history.pushState = updateState('pushState');
    history.replaceState = updateState('replaceState');
    window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));

    /**
     * Основная функция инициализации
     */
    function init() {
        createPanelToggle();
        sortReviews();
        expandDescription();

        // Наблюдатель за изменениями DOM
        const observer = new MutationObserver(() => {
            createPanelToggle();
            if (document.getElementById('ozon-enhancer-panel')) return;
            expandDescription();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Периодическая проверка описания
        setInterval(expandDescription, 5000);
    }

    // Запуск скрипта
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 1500);
    }

    // Обработчик изменения URL
    window.addEventListener('locationchange', () => {
        isSortingApplied = false;
        sortReviews();
        expandDescription();
    });
})();

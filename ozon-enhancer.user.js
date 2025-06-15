// ==UserScript==
// @name          Ozon Interface Enhancer
// @namespace     https://github.com/Zaomil
// @version       1.0.2
// @description   Улучшает интерфейс Ozon: сортирует отзывы от худших к лучшим, автоматически раскрывает описание товаров
// @author        Zaomil
// @license       MIT
// @icon          https://ozon.by/favicon.ico
// @match         https://*.ozon.by/*
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_addStyle
// @run-at        document-start
// @homepageURL   https://github.com/Zaomil/ozon-enhancer
// @supportURL    https://github.com/Zaomil/ozon-enhancer/issues
// ==/UserScript==

(function() {
    'use strict';

    /**
     * Конфигурация по умолчанию
     * @typedef {Object} Config
     * @property {boolean} sortReviews - Сортировать отзывы от худших к лучшим
     * @property {boolean} expandDescription - Автоматически раскрывать описание товаров
     */
    const DEFAULT_CONFIG = {
        sortReviews: true,
        expandDescription: true
    };

    /**
     * Управление настройками скрипта
     */
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

    // Флаг для предотвращения множественных срабатываний
    let isSortingApplied = false;

    /**
     * Сортирует отзывы товара от худших к лучшим
     * Работает через изменение параметра URL и перезагрузку страницы
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
            setTimeout(() => {
                window.location.href = urlObj.toString();
            }, 100);
        }
    }

    /**
     * Автоматически раскрывает скрытое описание товара
     * Поиск осуществляется по тексту кнопки и CSS-селекторам
     */
    function expandDescription() {
        if (!CONFIG.expandDescription) return;

        try {
            const buttonTexts = [
                'Показать полностью',
                'Развернуть описание',
                'Читать полностью',
                'Показать всё',
                'Развернуть'
            ];

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

            // Поиск по CSS-селекторам
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
                    if (btn &&
                        btn.offsetParent !== null &&
                        btn.getAttribute('aria-expanded') !== 'true') {
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
     */
    function createControlPanel() {
        const existingPanel = document.getElementById('ozon-enhancer-panel');
        if (existingPanel) existingPanel.remove();

        const panel = document.createElement('div');
        panel.id = 'ozon-enhancer-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50px;
            right: 10px;
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-family: Arial, sans-serif;
            min-width: 280px;
        `;

        // Заголовок панели
        const header = document.createElement('div');
        header.textContent = 'Ozon Enhancer';
        header.style.cssText = `
            font-weight: bold;
            font-size: 18px;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #eee;
            color: #1976d2;
        `;
        panel.appendChild(header);

        // Переключатели настроек
        panel.appendChild(createToggle(
            'Сортировать отзывы (от худших)',
            CONFIG.sortReviews,
            checked => {
                CONFIG.sortReviews = checked;
                if (checked) {
                    isSortingApplied = false;
                    sortReviews();
                }
            }
        ));

        panel.appendChild(createToggle(
            'Авто-раскрытие описания',
            CONFIG.expandDescription,
            checked => {
                CONFIG.expandDescription = checked;
                if (checked) expandDescription();
            }
        ));

        // Кнопка закрытия
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.title = 'Закрыть панель';
        closeBtn.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #999;
        `;
        closeBtn.addEventListener('click', () => panel.remove());
        panel.appendChild(closeBtn);

        document.body.appendChild(panel);
        return panel;
    }

    /**
     * Создает элемент переключателя
     * @param {string} label - Текст метки
     * @param {boolean} checked - Состояние переключателя
     * @param {function} onChange - Обработчик изменения
     */
    function createToggle(label, checked, onChange) {
        const container = document.createElement('div');
        container.style.cssText = `
            margin-bottom: 12px;
            display: flex;
            align-items: center;
        `;

        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.id = `toggle-${label.replace(/\s+/g, '-')}`;
        toggle.checked = checked;
        toggle.style.cssText = `
            margin-right: 10px;
            width: 18px;
            height: 18px;
            cursor: pointer;
        `;
        toggle.addEventListener('change', () => onChange(toggle.checked));

        const labelEl = document.createElement('label');
        labelEl.htmlFor = toggle.id;
        labelEl.textContent = label;
        labelEl.style.cssText = `
            cursor: pointer;
            font-size: 14px;
            user-select: none;
        `;

        container.appendChild(toggle);
        container.appendChild(labelEl);
        return container;
    }

    // Глобальные стили для элементов интерфейса
    GM_addStyle(`
        #ozon-enhancer-panel {
            transition: all 0.3s ease;
            animation: fadeIn 0.3s ease-out;
        }

        #ozon-enhancer-toggle {
            position: fixed;
            top: 10px;
            right: 10px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 8px 15px;
            cursor: pointer;
            z-index: 9999;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            transition: background 0.2s;
        }

        #ozon-enhancer-toggle:hover {
            background: #43a047;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `);

    /**
     * Создает кнопку активации панели управления
     */
    function createPanelToggle() {
        const existingToggle = document.getElementById('ozon-enhancer-toggle');
        if (existingToggle) existingToggle.remove();

        const toggle = document.createElement('button');
        toggle.id = 'ozon-enhancer-toggle';
        toggle.textContent = 'Ozon Enhancer';
        toggle.addEventListener('click', createControlPanel);
        document.body.appendChild(toggle);
    }

    // Перехват History API для SPA-приложений
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
     * - Создает UI элементы
     * - Применяет основные функции
     * - Настраивает наблюдатели за изменениями
     */
    function init() {
        createPanelToggle();

        // Первичное применение функций
        sortReviews();
        expandDescription();

        // Наблюдатель за динамическим контентом
        const observer = new MutationObserver(() => {
            if (document.getElementById('ozon-enhancer-panel')) return;
            expandDescription();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Периодическая проверка для SPA
        setInterval(() => {
            expandDescription();
        }, 5000);
    }

    // Запуск после загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 1000);
    }

    // Обработчик SPA навигации
    window.addEventListener('locationchange', () => {
        isSortingApplied = false;
        sortReviews();
        expandDescription();
    });
})();

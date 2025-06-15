// ==UserScript==
// @name          Ozon Interface Enhancer
// @namespace     https://github.com/Zaomil
// @version       1.0.1
// @description   Улучшает интерфейс Ozon: сортирует отзывы от худших к лучшим, раскрывает характеристики и описание, удаляет рекламу
// @author        Zaomil
// @license       MIT
// @icon          https://ozon.by/favicon.ico
// @match         https://*.ozon.by/*
// @grant         none
// @run-at        document-start
// @homepageURL   https://github.com/Zaomil/ozon-enhancer
// @supportURL    https://github.com/Zaomil/ozon-enhancer/issues
// @compatible    edge
// @compatible    chrome
// @compatible    firefox
// ==/UserScript==

(function() {
    'use strict';
    
    // ===== БЛОКИРОВКА ТРЕКЕРОВ =====
    const blockedTrackers = [
        'xapi.ozon.by/perf-metrics-collector',
        'sdk.js',
        'analytics.js',
        'tagmanager',
        'metrika',
        'cpm-ozon'
    ];
    
    // Перехват XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        if (blockedTrackers.some(tracker => url.includes(tracker))) return;
        originalOpen.apply(this, arguments);
    };
    
    // Перехват fetch
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        if (typeof url === 'string' && blockedTrackers.some(tracker => url.includes(tracker))) {
            return Promise.reject(new Error('Блокировано расширением'));
        }
        return originalFetch(url, options);
    };
    
    // ===== СОРТИРОВКА ОТЗЫВОВ =====
    function sortReviews() {
        // Только на страницах товаров
        if (!location.pathname.includes('/product/')) return;
        
        const urlObj = new URL(location.href);
        const params = urlObj.searchParams;
        
        // Если сортировка не установлена или неверная
        if (!params.has('sort') || 
            (params.get('sort') !== 'score_asc' && params.get('sort') !== 'score_desc')) {
            params.set('sort', 'score_asc');
            location.replace(urlObj.toString());
        }
    }
    
    // ===== УЛУЧШЕНИЯ ИНТЕРФЕЙСА =====
    function applyEnhancements() {
        // Задержка для динамического контента
        setTimeout(() => {
            try {
                // Раскрытие характеристик
                document.querySelectorAll('[class*="showMore"], [class*="expandButton"]').forEach(btn => {
                    const text = btn.textContent.toLowerCase();
                    if (text.includes('еще') || text.includes('развернуть') || text.includes('показать')) {
                        btn.click();
                    }
                });
                
                // Раскрытие описания товара
                const descriptionSelectors = [
                    '.d0k.d1k', '.k0k.k1k', '.a0k.a1k',
                    '[class*="description-toggle"]',
                    '[class*="description-expander"]',
                    '[aria-label="Развернуть описание"]'
                ];
                
                descriptionSelectors.forEach(selector => {
                    document.querySelectorAll(selector).forEach(el => {
                        if (el.getAttribute('aria-expanded') !== 'true') {
                            el.click();
                        }
                    });
                });
                
                // Поиск кнопок по тексту
                ['Показать полностью', 'Развернуть', 'Читать далее'].forEach(text => {
                    document.querySelectorAll('button, [role="button"]').forEach(btn => {
                        if (btn.textContent.includes(text) && btn.getAttribute('aria-expanded') !== 'true') {
                            btn.click();
                        }
                    });
                });
                
                // Удаление рекламы
                const adSelectors = [
                    '[data-widget="webToAppBanner"]',
                    '.app-download-banner',
                    '.app-promo',
                    '.mobile-app-banner',
                    '[data-widget="advertisement"]',
                    '[class*="banner"]',
                    '[class*="promo"]',
                    '[class*="advert"]',
                    '[id*="banner"]'
                ];
                
                adSelectors.forEach(selector => {
                    document.querySelectorAll(selector).forEach(el => {
                        if (el.clientHeight > 50) {
                            el.remove();
                        }
                    });
                });
            } catch (e) {
                // Игнорируем ошибки
            }
        }, 4000);
    }
    
    // ===== ОСНОВНОЙ КОД =====
    
    // Сортируем отзывы сразу
    sortReviews();
    
    // Применяем улучшения после загрузки страницы
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyEnhancements);
    } else {
        applyEnhancements();
    }
    
    // Отслеживание SPA-навигации
    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            setTimeout(() => {
                sortReviews();
                applyEnhancements();
            }, 1000);
        }
    }, 1500);
})();

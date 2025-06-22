// ==UserScript==
// @name          Ozon Interface Enhancer
// @namespace     https://github.com/Zaomil
// @version       1.0.4
// @description   Улучшает интерфейс Ozon: сортирует отзывы, раскрывает описание, отслеживает цены
// @author        Zaomil
// @license       MIT
// @icon          https://ozon.by/favicon.ico
// @match         https://*.ozon.by/*
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_addStyle
// @grant         GM_xmlhttpRequest
// @run-at        document-idle
// @homepageURL   https://github.com/Zaomil/ozon-enhancer
// @supportURL    https://github.com/Zaomil/ozon-enhancer/issues
// @connect       ozon.by
// ==/UserScript==

(function() {
    'use strict';

    // Конфигурация по умолчанию
    const DEFAULT_CONFIG = {
        sortReviews: true,
        expandDescription: true,
        trackPrices: true,
        maxTrackedItems: 3
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
        },
        get trackPrices() {
            return GM_getValue('trackPrices', DEFAULT_CONFIG.trackPrices);
        },
        set trackPrices(value) {
            GM_setValue('trackPrices', value);
        },
        get maxTrackedItems() {
            return GM_getValue('maxTrackedItems', DEFAULT_CONFIG.maxTrackedItems);
        },
        set maxTrackedItems(value) {
            GM_setValue('maxTrackedItems', value);
        },
        get trackedItems() {
            return GM_getValue('trackedItems', []);
        },
        set trackedItems(value) {
            GM_setValue('trackedItems', value);
        }
    };

    // Флаги состояния
    let isSortingApplied = false;
    let panelCreated = false;
    let isDescriptionExpanded = false;

    // Функция для парсинга цен
    function parsePriceText(text) {
        if (!text) return null;

        let cleanText = text
            .replace(/[\u00A0\u2009]/g, '')
            .replace(/\s/g, '')
            .replace(/,/g, '.')
            .replace(/[^\d.]/g, '');

        const priceMatch = cleanText.match(/\d+\.\d+|\d+\.|\d+/);
        if (priceMatch) {
            let priceValue = priceMatch[0];
            if (!priceValue.includes('.')) priceValue += '.00';

            const price = parseFloat(priceValue);
            if (!isNaN(price)) return price;
        }

        return null;
    }

    // Функция для извлечения артикула товара
    function extractProductArticle() {
        const urlMatch = location.pathname.match(/\/(\d+)(?:\/|\?|$)/);
        if (urlMatch && urlMatch[1]) return urlMatch[1];

        const jsonLd = document.querySelector('script[type="application/ld+json"]');
        if (jsonLd) {
            try {
                const data = JSON.parse(jsonLd.textContent);
                if (data.sku) return data.sku;
                if (data.offers && data.offers.sku) return data.offers.sku;
            } catch (e) {
                console.error('[OzonEnhancer] JSON-LD parse error:', e);
            }
        }

        const metaArticle = document.querySelector('meta[property="og:url"]');
        if (metaArticle) {
            const metaMatch = metaArticle.content.match(/\/(\d+)(?:\/|\?|$)/);
            if (metaMatch && metaMatch[1]) return metaMatch[1];
        }

        const cartButtons = document.querySelectorAll('[data-widget="webAddToCart"]');
        for (const btn of cartButtons) {
            const article = btn.getAttribute('data-article-id');
            if (article) return article;
        }

        return null;
    }

    // Функция для извлечения названия товара
    function extractProductName() {
        return document.querySelector('h1')?.textContent?.trim() || 'Неизвестный товар';
    }

    // Функция для извлечения текущей цены
    function extractCurrentPrice() {
        try {
            const ignoreSelectors = [
                '.ui-a0',
                '.ui-a2',
                '.ui-a3'
            ];

            const priceSelectors = [
                '[data-widget="webPrice"]',
                '.ui-p0-v',
                '.ui-q5', '.ui-q0',
                '.ui-o0', '.ui-o6'
            ];

            for (const selector of priceSelectors) {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    let shouldIgnore = false;
                    for (const ignoreSelector of ignoreSelectors) {
                        if (element.closest(ignoreSelector)) {
                            shouldIgnore = true;
                            break;
                        }
                    }
                    if (shouldIgnore) continue;

                    const price = parsePriceText(element.textContent);
                    if (price) return price;
                }
            }

            const fallbackElements = document.querySelectorAll('[class*="price"]');
            for (const element of fallbackElements) {
                const price = parsePriceText(element.textContent);
                if (price && price > 1) return price;
            }

            return null;
        } catch (e) {
            console.error('[OzonEnhancer] Price extraction error:', e);
            return null;
        }
    }

    // Добавление товара в список отслеживания
    function trackCurrentProduct() {
        if (!CONFIG.trackPrices) {
            alert('Включите отслеживание цен в настройках расширения');
            return false;
        }

        const article = extractProductArticle();
        if (!article) {
            alert('Не удалось определить артикул товара');
            return false;
        }

        if (CONFIG.trackedItems.length >= CONFIG.maxTrackedItems) {
            alert(`Достигнут лимит отслеживаемых товаров (${CONFIG.maxTrackedItems})`);
            return false;
        }

        const isAlreadyTracked = CONFIG.trackedItems.some(item => item.article === article);
        if (isAlreadyTracked) {
            alert('Этот товар уже отслеживается');
            return false;
        }

        const name = extractProductName();
        const price = extractCurrentPrice();
        const url = location.href.split('?')[0];

        if (!price) {
            alert('Не удалось определить цену товара');
            return false;
        }

        const newItem = {
            article,
            name,
            url,
            currentPrice: price,
            initialPrice: price,
            priceHistory: [{
                price,
                date: new Date().toISOString().split('T')[0]
            }],
            addedDate: new Date().toISOString()
        };

        CONFIG.trackedItems = [...CONFIG.trackedItems, newItem];
        return true;
    }

    // Добавление товара по артикулу
    function trackProductByArticle(article) {
        if (!CONFIG.trackPrices) {
            alert('Включите отслеживание цен в настройках расширения');
            return false;
        }

        if (!article || !/^\d+$/.test(article)) {
            alert('Пожалуйста, введите корректный артикул товара');
            return false;
        }

        if (CONFIG.trackedItems.length >= CONFIG.maxTrackedItems) {
            alert(`Достигнут лимит отслеживаемых товаров (${CONFIG.maxTrackedItems})`);
            return false;
        }

        const isAlreadyTracked = CONFIG.trackedItems.some(item => item.article === article);
        if (isAlreadyTracked) {
            alert('Этот товар уже отслеживается');
            return false;
        }

        const url = `https://ozon.by/product/${article}/`;

        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: function(response) {
                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, "text/html");

                        const name = doc.querySelector('h1')?.textContent?.trim() || `Товар #${article}`;
                        const price = extractPriceFromDocument(doc);

                        if (!price) {
                            alert('Не удалось определить цену товара');
                            resolve(false);
                            return;
                        }

                        const newItem = {
                            article,
                            name,
                            url,
                            currentPrice: price,
                            initialPrice: price,
                            priceHistory: [{
                                price,
                                date: new Date().toISOString().split('T')[0]
                            }],
                            addedDate: new Date().toISOString()
                        };

                        CONFIG.trackedItems = [...CONFIG.trackedItems, newItem];
                        resolve(true);
                    } catch (e) {
                        console.error('[OzonEnhancer] Article tracking error:', e);
                        alert('Ошибка при добавлении товара');
                        resolve(false);
                    }
                },
                onerror: function(error) {
                    console.error('[OzonEnhancer] Product fetch error:', error);
                    alert('Ошибка при загрузке данных товара');
                    resolve(false);
                }
            });
        });
    }

    // Функция для извлечения цены из документа
    function extractPriceFromDocument(doc) {
        try {
            const ignoreSelectors = [
                '.ui-a0',
                '.ui-a2',
                '.ui-a3'
            ];

            const priceSelectors = [
                '[data-widget="webPrice"]',
                '.ui-p0-v',
                '.ui-q5', '.ui-q0',
                '.ui-o0', '.ui-o6'
            ];

            for (const selector of priceSelectors) {
                const elements = doc.querySelectorAll(selector);
                for (const element of elements) {
                    let shouldIgnore = false;
                    for (const ignoreSelector of ignoreSelectors) {
                        if (element.closest(ignoreSelector)) {
                            shouldIgnore = true;
                            break;
                        }
                    }
                    if (shouldIgnore) continue;

                    const price = parsePriceText(element.textContent);
                    if (price) return price;
                }
            }

            const fallbackElements = doc.querySelectorAll('[class*="price"]');
            for (const element of fallbackElements) {
                const price = parsePriceText(element.textContent);
                if (price && price > 1) return price;
            }

            return null;
        } catch (e) {
            console.error('[OzonEnhancer] Price extraction error:', e);
            return null;
        }
    }

    // Обновление цены товара
    function updateTrackedItemPrice(article, newPrice) {
        const updatedItems = CONFIG.trackedItems.map(item => {
            if (item.article === article && item.currentPrice !== newPrice) {
                return {
                    ...item,
                    currentPrice: newPrice,
                    priceHistory: [
                        ...item.priceHistory,
                        {
                            price: newPrice,
                            date: new Date().toISOString().split('T')[0]
                        }
                    ]
                };
            }
            return item;
        });

        CONFIG.trackedItems = updatedItems;
    }

    // Удаление товара из отслеживания
    function removeTrackedItem(article) {
        CONFIG.trackedItems = CONFIG.trackedItems.filter(item => item.article !== article);
    }

    // Проверка цен отслеживаемых товаров
    function checkTrackedPrices() {
        if (!CONFIG.trackPrices || CONFIG.trackedItems.length === 0) return;

        const requests = CONFIG.trackedItems.map(item => {
            return new Promise(resolve => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: item.url,
                    onload: function(response) {
                        try {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(response.responseText, "text/html");
                            const price = extractPriceFromDocument(doc);
                            if (price) updateTrackedItemPrice(item.article, price);
                        } catch (e) {
                            console.error('[OzonEnhancer] Price update error:', e);
                        }
                        resolve();
                    },
                    onerror: function(error) {
                        console.error('[OzonEnhancer] Price check error:', error);
                        resolve();
                    }
                });
            });
        });

        Promise.all(requests).then(() => {
            if (panelCreated) createControlPanel();
        });
    }

    // Раскрытие описания товара
    function expandDescription() {
        if (isDescriptionExpanded || !CONFIG.expandDescription) return;
        if (!location.pathname.includes('/product/')) return;

        try {
            const buttonTexts = ['Показать полностью', 'Развернуть описание', 'Читать полностью', 'Показать всё', 'Развернуть'];

            for (const btn of document.querySelectorAll('button, [role="button"]')) {
                const btnText = btn.textContent?.trim() || '';
                if (buttonTexts.some(text => btnText.includes(text)) &&
                    btn.offsetParent !== null &&
                    btn.getAttribute('aria-expanded') !== 'true') {
                    btn.click();
                    isDescriptionExpanded = true;
                    return;
                }
            }

            const classSelectors = [
                '.ui-d0k',
                '[data-widget="webDescription"] button',
                '.description button',
                '.info-section button',
                '[class*="expandButton"]',
                '[class*="showMore"]',
                'button[data-widget="descriptionExpandButton"]',
                '.ui-k3 button',
                '.ozon-ui-k3 button',
                'button[aria-label="Развернуть описание"]'
            ];

            for (const selector of classSelectors) {
                const btn = document.querySelector(selector);
                if (btn && btn.offsetParent !== null && btn.getAttribute('aria-expanded') !== 'true') {
                    btn.click();
                    isDescriptionExpanded = true;
                    return;
                }
            }
        } catch (e) {
            console.error('[OzonEnhancer] Description expand error:', e);
        }
    }

    // Показать график цены для товара
    function showPriceChart(item) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 20000;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 20px;
            max-width: 90%;
            max-height: 90%;
            overflow: auto;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            width: 400px;
        `;

        modal.appendChild(modalContent);

        const title = document.createElement('div');
        title.textContent = `История цены: ${item.name}`;
        title.style.cssText = `
            font-weight: 600;
            font-size: 16px;
            margin-bottom: 15px;
            text-align: center;
        `;
        modalContent.appendChild(title);

        if (item.priceHistory.length < 2) {
            const message = document.createElement('div');
            message.textContent = 'Недостаточно данных для построения графика';
            message.style.cssText = 'text-align: center; color: #666; padding: 20px 0;';
            modalContent.appendChild(message);
        } else {
            const chartContainer = document.createElement('div');
            chartContainer.style.cssText = 'height: 250px; position: relative;';
            modalContent.appendChild(chartContainer);

            const canvas = document.createElement('canvas');
            canvas.width = 360;
            canvas.height = 250;
            chartContainer.appendChild(canvas);
            const ctx = canvas.getContext('2d');

            const prices = item.priceHistory.map(entry => entry.price);
            const dates = item.priceHistory.map(entry => entry.date);

            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const priceRange = maxPrice - minPrice;

            const gradient = ctx.createLinearGradient(0, 0, 0, 250);
            gradient.addColorStop(0, 'rgba(0, 102, 255, 0.8)');
            gradient.addColorStop(1, 'rgba(0, 102, 255, 0.2)');

            ctx.lineWidth = 3;
            ctx.strokeStyle = '#0066ff';
            ctx.fillStyle = gradient;

            const points = [];
            const padding = 30;
            const graphWidth = canvas.width - padding * 2;
            const graphHeight = canvas.height - padding * 2;

            for (let i = 0; i < prices.length; i++) {
                const x = padding + (i / (prices.length - 1)) * graphWidth;
                const y = padding + graphHeight - ((prices[i] - minPrice) / priceRange * graphHeight);
                points.push({x, y});
            }

            ctx.beginPath();
            ctx.moveTo(padding, padding + graphHeight);
            points.forEach(point => ctx.lineTo(point.x, point.y));
            ctx.lineTo(padding + graphWidth, padding + graphHeight);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            points.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
            ctx.stroke();

            ctx.fillStyle = '#0066ff';
            points.forEach(point => {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.fillStyle = '#333';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';

            ctx.fillText(`${prices[0].toFixed(2)} BYN`, points[0].x, points[0].y - 15);
            ctx.fillText(dates[0], points[0].x, points[0].y + 25);

            ctx.fillText(`${prices[prices.length - 1].toFixed(2)} BYN`,
                points[points.length - 1].x,
                points[points.length - 1].y - 15
            );
            ctx.fillText(dates[dates.length - 1],
                points[points.length - 1].x,
                points[points.length - 1].y + 25
            );

            const minIndex = prices.indexOf(minPrice);
            const maxIndex = prices.indexOf(maxPrice);

            if (minIndex !== 0 && minIndex !== prices.length - 1) {
                ctx.fillText(`${minPrice.toFixed(2)} BYN`, points[minIndex].x, points[minIndex].y - 15);
                ctx.fillText(dates[minIndex], points[minIndex].x, points[minIndex].y + 25);
            }

            if (maxIndex !== 0 && maxIndex !== prices.length - 1) {
                ctx.fillText(`${maxPrice.toFixed(2)} BYN`, points[maxIndex].x, points[maxIndex].y - 15);
                ctx.fillText(dates[maxIndex], points[maxIndex].x, points[maxIndex].y + 25);
            }
        }

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Закрыть';
        closeBtn.style.cssText = `
            display: block;
            margin: 15px auto 0;
            padding: 8px 20px;
            background: #0066ff;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
        `;
        closeBtn.addEventListener('click', () => modal.remove());
        modalContent.appendChild(closeBtn);

        document.body.appendChild(modal);
    }

    // Создает панель управления
    function createControlPanel() {
        if (panelCreated) return;
        panelCreated = true;

        const existingPanel = document.getElementById('ozon-enhancer-panel');
        if (existingPanel) existingPanel.remove();

        const panel = document.createElement('div');
        panel.id = 'ozon-enhancer-panel';
        panel.style.cssText = `
            position: fixed;
            top: 60px;
            right: 10px;
            background: #ffffff;
            border-radius: 12px;
            padding: 0;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            width: 340px;
            max-height: 80vh;
            overflow: hidden;
            border: 1px solid #eaeaea;
            display: flex;
            flex-direction: column;
        `;

        const header = document.createElement('div');
        header.textContent = 'Ozon Enhancer';
        header.style.cssText = `
            font-weight: 600;
            font-size: 16px;
            padding: 14px 16px;
            background: linear-gradient(135deg, #0066ff 0%, #0048cc 100%);
            color: white;
            display: flex;
            align-items: center;
            gap: 8px;
            position: relative;
        `;

        const icon = document.createElement('div');
        icon.innerHTML = '⚡';
        icon.style.fontSize = '18px';
        header.prepend(icon);
        panel.appendChild(header);

        const settingsContainer = document.createElement('div');
        settingsContainer.style.cssText = `
            padding: 12px 16px;
            overflow-y: auto;
            flex-grow: 1;
        `;
        panel.appendChild(settingsContainer);

        settingsContainer.appendChild(createToggle(
            'Сортировка отзывов (от худших)',
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

        settingsContainer.appendChild(createToggle(
            'Отслеживание цен',
            '💰',
            CONFIG.trackPrices,
            checked => {
                CONFIG.trackPrices = checked;
                createControlPanel(); // Пересоздаем панель при изменении
            }
        ));

        // Секция отслеживания цен показывается только если включена функция
        if (CONFIG.trackPrices) {
            const priceTrackingSection = document.createElement('div');
            priceTrackingSection.style.cssText = `
                margin-top: 15px;
                border-top: 1px solid #f0f0f0;
                padding-top: 15px;
            `;

            const priceHeader = document.createElement('div');
            priceHeader.textContent = 'Отслеживание цен';
            priceHeader.style.cssText = `
                font-weight: 600;
                font-size: 15px;
                margin-bottom: 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;

            const refreshButton = document.createElement('button');
            refreshButton.textContent = 'Обновить цены';
            refreshButton.style.cssText = `
                background: #f0f0f0;
                border: none;
                padding: 5px 10px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
            `;
            refreshButton.addEventListener('click', () => {
                refreshButton.textContent = 'Обновление...';
                refreshButton.disabled = true;
                checkTrackedPrices();
                setTimeout(() => {
                    if (panelCreated) createControlPanel();
                    refreshButton.disabled = false;
                    refreshButton.textContent = 'Обновить цены';
                }, 3000);
            });
            priceHeader.appendChild(refreshButton);

            if (location.pathname.includes('/product/')) {
                const addButton = document.createElement('button');
                addButton.textContent = 'Добавить текущий';
                addButton.style.cssText = `
                    background: #0066ff;
                    color: white;
                    border: none;
                    padding: 5px 10px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                    margin-left: 8px;
                `;
                addButton.addEventListener('click', () => {
                    if (trackCurrentProduct()) {
                        alert('Товар добавлен в отслеживание!');
                        createControlPanel();
                    }
                });
                priceHeader.appendChild(addButton);
            }

            priceTrackingSection.appendChild(priceHeader);

            const manualAddForm = document.createElement('div');
            manualAddForm.style.cssText = `
                display: flex;
                gap: 8px;
                margin: 12px 0;
            `;

            const articleInput = document.createElement('input');
            articleInput.type = 'text';
            articleInput.placeholder = 'Введите артикул товара';
            articleInput.style.cssText = `
                flex-grow: 1;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 13px;
            `;

            const manualAddButton = document.createElement('button');
            manualAddButton.textContent = 'Добавить';
            manualAddButton.style.cssText = `
                background: #0066ff;
                color: white;
                border: none;
                padding: 8px 12px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                white-space: nowrap;
            `;

            manualAddButton.addEventListener('click', () => {
                const article = articleInput.value.trim();
                if (!article) {
                    alert('Пожалуйста, введите артикул товара');
                    return;
                }

                manualAddButton.textContent = 'Добавление...';
                manualAddButton.disabled = true;

                trackProductByArticle(article).then(success => {
                    manualAddButton.textContent = 'Добавить';
                    manualAddButton.disabled = false;

                    if (success) {
                        alert('Товар успешно добавлен!');
                        articleInput.value = '';
                        createControlPanel();
                    }
                });
            });

            manualAddForm.appendChild(articleInput);
            manualAddForm.appendChild(manualAddButton);
            priceTrackingSection.appendChild(manualAddForm);

            const trackedItemsContainer = document.createElement('div');
            trackedItemsContainer.id = 'ozon-tracked-items';
            trackedItemsContainer.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 10px;
                margin-top: 8px;
                max-height: 200px;
                overflow-y: auto;
                padding-right: 4px;
            `;

            if (CONFIG.trackedItems.length === 0) {
                const emptyState = document.createElement('div');
                emptyState.textContent = 'Нет отслеживаемых товаров';
                emptyState.style.cssText = `
                    text-align: center;
                    padding: 15px;
                    color: #888;
                    font-size: 13px;
                `;
                trackedItemsContainer.appendChild(emptyState);
            } else {
                CONFIG.trackedItems.forEach(item => {
                    const itemEl = document.createElement('div');
                    itemEl.style.cssText = `
                        border: 1px solid #eee;
                        border-radius: 8px;
                        padding: 10px;
                        position: relative;
                    `;

                    const itemName = document.createElement('a');
                    itemName.href = item.url;
                    itemName.textContent = item.name.length > 40 ? item.name.substring(0, 40) + '...' : item.name;
                    itemName.title = item.name;
                    itemName.target = '_blank';
                    itemName.style.cssText = `
                        font-weight: 500;
                        display: block;
                        margin-bottom: 6px;
                        text-decoration: none;
                        color: #0066ff;
                        font-size: 13px;
                    `;

                    const priceInfo = document.createElement('div');
                    const initialPrice = item.initialPrice;
                    const currentPrice = item.currentPrice;
                    const diff = currentPrice - initialPrice;
                    const diffPercent = ((Math.abs(diff) / initialPrice) * 100).toFixed(1);

                    priceInfo.innerHTML = `
                        <div style="font-size: 15px; font-weight: 700; color: ${diff < 0 ? '#00a046' : '#ff3b30'}">
                            ${currentPrice.toFixed(2)} BYN
                        </div>
                        <div style="font-size: 12px; color: #666; margin-top: 3px;">
                            ${diff === 0 ? 'Без изменений' :
                             diff < 0 ? `▼ -${Math.abs(diff).toFixed(2)} BYN (${diffPercent}%)` :
                             `▲ +${diff.toFixed(2)} BYN (${diffPercent}%)`}
                        </div>
                    `;

                    const buttonsContainer = document.createElement('div');
                    buttonsContainer.style.cssText = `
                        position: absolute;
                        top: 6px;
                        right: 6px;
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                    `;

                    const removeBtn = document.createElement('button');
                    removeBtn.textContent = '✕';
                    removeBtn.title = 'Удалить из отслеживания';
                    removeBtn.style.cssText = `
                        width: 22px;
                        height: 22px;
                        border: none;
                        background: #f8f8f8;
                        border-radius: 50%;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 14px;
                        color: #999;
                    `;
                    removeBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        removeTrackedItem(item.article);
                        createControlPanel();
                    });

                    const chartBtn = document.createElement('button');
                    chartBtn.textContent = '📈';
                    chartBtn.title = 'Показать график цены';
                    chartBtn.style.cssText = `
                        width: 22px;
                        height: 22px;
                        border: none;
                        background: #f8f8f8;
                        border-radius: 50%;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 14px;
                        color: #999;
                    `;
                    chartBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        showPriceChart(item);
                    });

                    buttonsContainer.appendChild(chartBtn);
                    buttonsContainer.appendChild(removeBtn);

                    itemEl.appendChild(itemName);
                    itemEl.appendChild(priceInfo);
                    itemEl.appendChild(buttonsContainer);
                    trackedItemsContainer.appendChild(itemEl);
                });
            }

            priceTrackingSection.appendChild(trackedItemsContainer);
            settingsContainer.appendChild(priceTrackingSection);
        }

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.title = 'Закрыть панель';
        closeBtn.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(255,255,255,0.2);
            border: none;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: white;
            font-size: 18px;
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

    // Создает элемент переключателя
    function createToggle(label, icon, checked, onChange) {
        const container = document.createElement('div');
        container.style.cssText = `
            display: flex;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid #f0f0f0;
        `;

        const iconEl = document.createElement('div');
        iconEl.textContent = icon;
        iconEl.style.cssText = `
            font-size: 18px;
            margin-right: 10px;
            width: 22px;
            text-align: center;
        `;
        container.appendChild(iconEl);

        const textContainer = document.createElement('div');
        textContainer.style.flex = '1';

        const labelEl = document.createElement('div');
        labelEl.textContent = label;
        labelEl.style.cssText = `
            font-weight: 500;
            font-size: 13px;
            color: #333;
        `;
        textContainer.appendChild(labelEl);
        container.appendChild(textContainer);

        const toggleContainer = document.createElement('label');
        toggleContainer.style.cssText = `
            position: relative;
            display: inline-block;
            width: 40px;
            height: 22px;
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
            border-radius: 22px;
        `;

        const toggleKnob = document.createElement('span');
        toggleKnob.style.cssText = `
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 2px;
            bottom: 2px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
            box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        `;

        toggleSlider.appendChild(toggleKnob);
        toggleContainer.appendChild(toggleInput);
        toggleContainer.appendChild(toggleSlider);
        container.appendChild(toggleContainer);

        const updateToggleStyle = () => {
            if (toggleInput.checked) {
                toggleSlider.style.backgroundColor = '#0066ff';
                toggleKnob.style.transform = 'translateX(18px)';
            } else {
                toggleSlider.style.backgroundColor = '#ccc';
                toggleKnob.style.transform = 'translateX(0)';
            }
        };
        toggleInput.addEventListener('change', updateToggleStyle);
        updateToggleStyle();

        return container;
    }

    // Создает кнопку активации панели управления
    function createPanelToggle() {
        if (document.getElementById('ozon-enhancer-toggle')) return;

        const toggle = document.createElement('button');
        toggle.id = 'ozon-enhancer-toggle';
        toggle.innerHTML = '⚡ Ozon Enhancer';
        toggle.addEventListener('click', createControlPanel);
        document.body.appendChild(toggle);
        return toggle;
    }

    // Сортирует отзывы по возрастанию рейтинга
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
            background: linear-gradient(135deg, #0066ff 0%, #0048cc 100%) !important;
            color: white !important;
            border: none !important;
            border-radius: 6px !important;
            padding: 9px 16px !important;
            cursor: pointer !important;
            z-index: 2147483647 !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            box-shadow: 0 5px 15px rgba(0,102,255,0.4) !important;
            transition: all 0.2s ease !important;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        #ozon-enhancer-toggle:hover {
            background: linear-gradient(135deg, #0052d9 0%, #003cb0 100%) !important;
            transform: translateY(-1px) !important;
            box-shadow: 0 6px 16px rgba(0,102,255,0.5) !important;
        }

        #ozon-enhancer-toggle:active {
            transform: translateY(0) !important;
        }

        #ozon-tracked-items::-webkit-scrollbar {
            width: 5px;
        }
        #ozon-tracked-items::-webkit-scrollbar-track {
            background: #f1f1f1;
        }
        #ozon-tracked-items::-webkit-scrollbar-thumb {
            background: #c1c1c1;
            border-radius: 4px;
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

    // Основная функция инициализации
    function init() {
        createPanelToggle();
        sortReviews();
        expandDescription();

        // Наблюдатель за изменениями DOM
        const observer = new MutationObserver(() => {
            createPanelToggle();
            isDescriptionExpanded = false;
            expandDescription();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Периодическая проверка описания
        let expandAttempts = 0;
        const expandInterval = setInterval(() => {
            if (!location.pathname.includes('/product/')) return;
            if (isDescriptionExpanded || expandAttempts >= 3) {
                clearInterval(expandInterval);
                return;
            }
            expandDescription();
            expandAttempts++;
        }, 5000);

        // Периодическая проверка цен (каждые 2 часа)
        setInterval(checkTrackedPrices, 2 * 60 * 60 * 1000);
    }

    // Запуск скрипта
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 1000);
    }

    // Обработчик изменения URL
    window.addEventListener('locationchange', () => {
        isSortingApplied = false;
        isDescriptionExpanded = false;
        sortReviews();
        expandDescription();

        if (panelCreated) {
            panelCreated = false;
            createControlPanel();
        }
    });
})();

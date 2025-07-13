// ==UserScript==
// @name          Ozon Interface Enhancer
// @namespace     https://github.com/Zaomil
// @version       1.0.6
// @description   Улучшает интерфейс Ozon: сортирует отзывы, раскрывает описание, отслеживает цены
// @author        Zaomil
// @license       MIT
// @icon          https://ozon.by/favicon.ico
// @match         https://*.ozon.by/*
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_addStyle
// @grant         GM_xmlhttpRequest
// @grant         GM_notification
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
        maxTrackedItems: 5,
        priceDropNotifications: true
    };

    // Цветовая схема интерфейса
    const COLORS = {
        background: "#121212",
        surface: "#1e1e1e",
        primary: "#BB86FC",
        primaryVariant: "#3700B3",
        secondary: "#03DAC6",
        text: "#E0E0E0",
        textSecondary: "#A0A0A0",
        error: "#CF6679",
        success: "#00C853",
        warning: "#FFAB00"
    };

    // Управление конфигурацией
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
            const stored = GM_getValue('maxTrackedItems', DEFAULT_CONFIG.maxTrackedItems);
            return Math.max(stored, DEFAULT_CONFIG.maxTrackedItems);
        },
        set maxTrackedItems(value) {
            GM_setValue('maxTrackedItems', value);
        },
        get trackedItems() {
            return GM_getValue('trackedItems', []);
        },
        set trackedItems(value) {
            GM_setValue('trackedItems', value);
        },
        get priceDropNotifications() {
            return GM_getValue('priceDropNotifications', DEFAULT_CONFIG.priceDropNotifications);
        },
        set priceDropNotifications(value) {
            GM_setValue('priceDropNotifications', value);
        },
        get currentPanelTab() {
            return GM_getValue('currentPanelTab', 'settings');
        },
        set currentPanelTab(value) {
            GM_setValue('currentPanelTab', value);
        },
        get lastPriceCheckTime() {
            return GM_getValue('lastPriceCheckTime', null);
        },
        set lastPriceCheckTime(value) {
            GM_setValue('lastPriceCheckTime', value);
        }
    };

    // Состояние скрипта
    let isSortingApplied = false;
    let panelCreated = false;
    let isDescriptionExpanded = false;
    let currentTab = CONFIG.currentPanelTab;

    // Селекторы для элементов страницы
    const SELECTORS = {
        price: [
            '[data-widget="webPrice"]',
            '.ui-p0-v',
            '.ui-q5',
            '.ui-q0',
            '.ui-o0',
            '.ui-o6'
        ],
        expandButtons: [
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
        ],
        gallerySelectors: [
            '.gallery-modal',
            '.image-gallery',
            '.zoom-modal',
            '[class*="galleryContainer"]',
            '.image-viewer',
            '.image-slider'
        ]
    };

    // Парсинг цены из текста
    function parsePriceText(text) {
        if (!text) return null;
        const matches = text.match(/\d+[.,]\d{1,2}/);
        if (matches) return parseFloat(matches[0].replace(',', '.'));
        const intMatch = text.match(/\d+/);
        return intMatch ? parseFloat(intMatch[0]) : null;
    }

    // Извлечение артикула товара
    function extractProductArticle() {
        const urlMatch = location.pathname.match(/\/(\d+)(?:\/|\?|$)/);
        if (urlMatch?.[1]) return urlMatch[1];

        try {
            const jsonLd = document.querySelector('script[type="application/ld+json"]');
            if (jsonLd) {
                const data = JSON.parse(jsonLd.textContent);
                return data.sku || data.offers?.sku;
            }
        } catch (e) {
            console.error('Ошибка при парсинге JSON-LD:', e);
        }

        const metaArticle = document.querySelector('meta[property="og:url"]');
        if (metaArticle) {
            const metaMatch = metaArticle.content.match(/\/(\d+)(?:\/|\?|$)/);
            if (metaMatch?.[1]) return metaMatch[1];
        }

        const cartButtons = document.querySelectorAll('[data-widget="webAddToCart"]');
        for (const btn of cartButtons) {
            const article = btn.getAttribute('data-article-id');
            if (article) return article;
        }
        return null;
    }

    // Получение названия товара
    function extractProductName() {
        return document.querySelector('h1')?.textContent?.trim() || 'Неизвестный товар';
    }

    // Получение текущей цены товара
    function extractCurrentPrice() {
        try {
            for (const selector of SELECTORS.price) {
                const element = document.querySelector(selector);
                if (element) {
                    const price = parsePriceText(element.textContent);
                    if (price && price > 1) return price;
                }
            }
            return null;
        } catch (e) {
            console.error('Ошибка при извлечении цены:', e);
            return null;
        }
    }

    // Отслеживание текущего товара
    function trackCurrentProduct() {
        if (!CONFIG.trackPrices) {
            alert('Включите отслеживание цен в настройках расширения');
            return false;
        }

        if (CONFIG.trackedItems.length >= CONFIG.maxTrackedItems) {
            alert(`Достигнут лимит отслеживаемых товаров (${CONFIG.maxTrackedItems})`);
            return false;
        }

        const article = extractProductArticle();
        if (!article) {
            alert('Не удалось определить артикул товара');
            return false;
        }

        if (CONFIG.trackedItems.some(item => item.article === article)) {
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
            addedDate: new Date().toISOString(),
            lastNotifiedPrice: price
        };

        CONFIG.trackedItems = [...CONFIG.trackedItems, newItem];
        return true;
    }

    // Отслеживание товара по артикулу
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

        if (CONFIG.trackedItems.some(item => item.article === article)) {
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
                            addedDate: new Date().toISOString(),
                            lastNotifiedPrice: price
                        };

                        CONFIG.trackedItems = [...CONFIG.trackedItems, newItem];
                        resolve(true);
                    } catch (e) {
                        console.error('Ошибка при добавлении товара:', e);
                        alert('Ошибка при добавлении товара');
                        resolve(false);
                    }
                },
                onerror: function() {
                    alert('Ошибка при загрузке данных товара');
                    resolve(false);
                }
            });
        });
    }

    // Извлечение цены из DOM документа
    function extractPriceFromDocument(doc) {
        try {
            for (const selector of SELECTORS.price) {
                const element = doc.querySelector(selector);
                if (element) {
                    const price = parsePriceText(element.textContent);
                    if (price && price > 1) return price;
                }
            }
            return null;
        } catch (e) {
            console.error('Ошибка при извлечении цены из документа:', e);
            return null;
        }
    }

    // Обновление цены отслеживаемого товара
    function updateTrackedItemPrice(article, newPrice) {
        let priceDropDetected = false;
        let notificationItem = null;
        let oldPrice = null;

        const updatedItems = CONFIG.trackedItems.map(item => {
            if (item.article === article && item.currentPrice !== newPrice) {
                if (newPrice < item.currentPrice) {
                    priceDropDetected = true;
                    notificationItem = item;
                    oldPrice = item.currentPrice;
                }

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

        if (priceDropDetected && CONFIG.priceDropNotifications) {
            showPriceDropNotification(notificationItem, oldPrice, newPrice);
        }

        return priceDropDetected;
    }

    // Уведомление о снижении цены
    function showPriceDropNotification(item, oldPrice, newPrice) {
        if (!CONFIG.priceDropNotifications) return;

        const priceDiff = (oldPrice - newPrice).toFixed(2);
        const discount = ((1 - newPrice / oldPrice) * 100).toFixed(0);

        if (GM_notification) {
            GM_notification({
                title: "🔔 Цена снизилась!",
                text: `${item.name}: ${newPrice.toFixed(2)} BYN (↓${priceDiff} BYN)`,
                image: "https://ozon.by/favicon.ico",
                timeout: 8000,
                onclick: () => window.open(item.url, '_blank')
            });
        }
    }

    // Удаление товара из отслеживания
    function removeTrackedItem(article) {
        CONFIG.trackedItems = CONFIG.trackedItems.filter(item => item.article !== article);
    }

    // Проверка цен отслеживаемых товаров
    function checkTrackedPrices(force = false) {
        if (!CONFIG.trackPrices || CONFIG.trackedItems.length === 0) return;

        const now = new Date();
        const lastCheckTime = CONFIG.lastPriceCheckTime ? new Date(CONFIG.lastPriceCheckTime) : null;
        const minCheckInterval = 10 * 60 * 1000;

        if (!force && lastCheckTime && (now - lastCheckTime < minCheckInterval)) {
            return;
        }

        CONFIG.lastPriceCheckTime = now.toISOString();

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
                            console.error('Ошибка при обновлении цены товара:', e);
                        }
                        resolve();
                    },
                    onerror: function() {
                        resolve();
                    }
                });
            });
        });

        Promise.all(requests).then(() => {
            if (panelCreated) refreshPanel();
        });
    }

    // Автоматическое раскрытие описания товара
    function expandDescription() {
        if (isDescriptionExpanded || !CONFIG.expandDescription) return;
        if (!location.pathname.includes('/product/')) return;

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
    }

    // Форматирование даты в формате dd/mm/yyyy
    function formatDate(dateString) {
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    }

    // Показ графика цены товара
    function showPriceChart(item) {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 20000;
            backdrop-filter: blur(4px);
            animation: fadeIn 0.4s ease-out;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: ${COLORS.surface};
            border-radius: 12px;
            padding: 20px;
            width: min(90vw, 700px);
            max-height: 90vh;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            color: ${COLORS.text};
            display: flex;
            flex-direction: column;
            transform: scale(0.95);
            animation: scaleIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        `;

        modal.appendChild(modalContent);

        const title = document.createElement('div');
        title.textContent = `История цены: ${item.name}`;
        title.style.cssText = `
            font-weight: 600;
            font-size: 18px;
            margin-bottom: 15px;
            text-align: center;
            color: ${COLORS.primary};
            text-shadow: 0 0 10px rgba(187, 134, 252, 0.3);
        `;
        modalContent.appendChild(title);

        const infoRow = document.createElement('div');
        infoRow.style.cssText = `
            display: flex;
            justify-content: space-around;
            margin-bottom: 15px;
            background: linear-gradient(45deg, rgba(30,30,30,0.8), rgba(50,50,50,0.4));
            border-radius: 8px;
            padding: 12px;
            gap: 10px;
            flex-wrap: wrap;
        `;

        const initialPrice = item.initialPrice;
        const currentPrice = item.currentPrice;
        const minPrice = Math.min(...item.priceHistory.map(p => p.price));
        const maxPrice = Math.max(...item.priceHistory.map(p => p.price));
        const diff = currentPrice - initialPrice;
        const diffPercent = ((Math.abs(diff) / initialPrice) * 100).toFixed(1);

        infoRow.innerHTML = `
            <div style="text-align: center; min-width: 120px;">
                <div style="font-size: 12px; color: ${COLORS.textSecondary}">Текущая</div>
                <div style="font-weight: 700; font-size: 16px; color: ${currentPrice < initialPrice ? COLORS.success : COLORS.text}">
                    ${currentPrice.toFixed(2)} BYN
                </div>
                <div style="font-size: 12px; color: ${diff === 0 ? COLORS.textSecondary : diff < 0 ? COLORS.success : COLORS.error}; margin-top: 4px;">
                    ${diff === 0 ? 'Без изменений' :
                     diff < 0 ? `▼ ${Math.abs(diff).toFixed(2)} BYN (${diffPercent}%)` :
                     `▲ ${diff.toFixed(2)} BYN (${diffPercent}%)`}
                </div>
            </div>
            <div style="text-align: center; min-width: 120px;">
                <div style="font-size: 12px; color: ${COLORS.textSecondary}">Начальная</div>
                <div style="font-weight: 700; font-size: 16px;">${initialPrice.toFixed(2)} BYN</div>
            </div>
            <div style="text-align: center; min-width: 120px;">
                <div style="font-size: 12px; color: ${COLORS.textSecondary}">Минимальная</div>
                <div style="font-weight: 700; font-size: 16px; color: ${COLORS.success}">${minPrice.toFixed(2)} BYN</div>
            </div>
            <div style="text-align: center; min-width: 120px;">
                <div style="font-size: 12px; color: ${COLORS.textSecondary}">Максимальная</div>
                <div style="font-weight: 700; font-size: 16px; color: ${COLORS.error}">${maxPrice.toFixed(2)} BYN</div>
            </div>
        `;
        modalContent.appendChild(infoRow);

        if (item.priceHistory.length < 2) {
            const message = document.createElement('div');
            message.textContent = 'Недостаточно данных для построения графика';
            message.style.cssText = 'text-align: center; color: #666; padding: 20px 0;';
            modalContent.appendChild(message);
        } else {
            const chartContainer = document.createElement('div');
            chartContainer.style.cssText = 'height: 300px; position: relative;';
            modalContent.appendChild(chartContainer);

            const canvas = document.createElement('canvas');
            chartContainer.appendChild(canvas);
            document.body.appendChild(modal);

            setTimeout(() => {
                const ctx = canvas.getContext('2d');
                const containerWidth = chartContainer.clientWidth;
                const containerHeight = chartContainer.clientHeight;

                canvas.width = containerWidth;
                canvas.height = containerHeight;

                const sortedHistory = [...item.priceHistory].sort((a, b) =>
                    new Date(a.date) - new Date(b.date)
                );

                const prices = sortedHistory.map(entry => entry.price);
                const dates = sortedHistory.map(entry => formatDate(entry.date));

                const minVal = Math.min(...prices);
                const maxVal = Math.max(...prices);
                const range = maxVal - minVal || 1;

                // Увеличенные отступы для осей
                const padding = { top: 30, right: 30, bottom: 50, left: 60 };
                const graphWidth = canvas.width - padding.left - padding.right;
                const graphHeight = canvas.height - padding.top - padding.bottom;

                // Очистка холста
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Функции преобразования значений
                const x = (index) => padding.left + (index / (prices.length - 1)) * graphWidth;
                const y = (price) => padding.top + graphHeight - ((price - minVal) / range * graphHeight);

                // Рисование сетки
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.lineWidth = 1;
                ctx.beginPath();

                // Горизонтальные линии сетки
                const horizontalLineCount = 6;
                for (let i = 0; i < horizontalLineCount; i++) {
                    const value = minVal + (i / (horizontalLineCount - 1)) * range;
                    const yCoord = y(value);
                    ctx.moveTo(padding.left, yCoord);
                    ctx.lineTo(canvas.width - padding.right, yCoord);

                    // Подписи значений по оси Y
                    ctx.fillStyle = COLORS.textSecondary;
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'middle';
                    ctx.font = '12px sans-serif';
                    ctx.fillText(value.toFixed(2), padding.left - 10, yCoord);
                }
                ctx.stroke();

                // Рисование осей
                ctx.strokeStyle = COLORS.text;
                ctx.lineWidth = 2;
                ctx.beginPath();
                // Ось Y
                ctx.moveTo(padding.left, padding.top);
                ctx.lineTo(padding.left, padding.top + graphHeight);
                // Ось X
                ctx.moveTo(padding.left, padding.top + graphHeight);
                ctx.lineTo(canvas.width - padding.right, padding.top + graphHeight);
                ctx.stroke();

                // Градиент под графиком
                const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + graphHeight);
                gradient.addColorStop(0, 'rgba(187, 134, 252, 0.3)');
                gradient.addColorStop(1, 'rgba(187, 134, 252, 0.05)');

                // Определение важных точек
                const importantPoints = [
                    { index: 0, label: `${prices[0].toFixed(2)} BYN`, date: dates[0] },
                    { index: prices.length - 1, label: `${prices[prices.length - 1].toFixed(2)} BYN`, date: dates[dates.length - 1] }
                ];

                const minIndex = prices.indexOf(minVal);
                const maxIndex = prices.indexOf(maxVal);

                if (minIndex !== 0 && minIndex !== prices.length - 1) {
                    importantPoints.push({
                        index: minIndex,
                        label: `${minVal.toFixed(2)} BYN`,
                        date: dates[minIndex]
                    });
                }

                if (maxIndex !== 0 && maxIndex !== prices.length - 1) {
                    importantPoints.push({
                        index: maxIndex,
                        label: `${maxVal.toFixed(2)} BYN`,
                        date: dates[maxIndex]
                    });
                }

                // Подписи дат по оси X
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillStyle = COLORS.text;
                ctx.font = '12px sans-serif';

                // Убедимся, что даты не перекрываются
                const drawnPositions = [];
                importantPoints.forEach(point => {
                    const xCoord = x(point.index);

                    // Проверка наложения
                    let canDraw = true;
                    for (const pos of drawnPositions) {
                        if (Math.abs(xCoord - pos) < 60) {
                            canDraw = false;
                            break;
                        }
                    }

                    if (canDraw) {
                        ctx.fillText(point.date, xCoord, padding.top + graphHeight + 15);
                        drawnPositions.push(xCoord);
                    }
                });

                // Заливка под графиком
                ctx.beginPath();
                ctx.moveTo(x(0), y(prices[0]));
                for (let i = 1; i < prices.length; i++) {
                    ctx.lineTo(x(i), y(prices[i]));
                }
                ctx.lineTo(x(prices.length - 1), y(prices[prices.length - 1]));
                ctx.lineTo(x(prices.length - 1), padding.top + graphHeight);
                ctx.lineTo(x(0), padding.top + graphHeight);
                ctx.closePath();
                ctx.fillStyle = gradient;
                ctx.fill();

                // Линия графика
                ctx.beginPath();
                ctx.moveTo(x(0), y(prices[0]));
                for (let i = 1; i < prices.length; i++) {
                    ctx.lineTo(x(i), y(prices[i]));
                }
                ctx.lineWidth = 4;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                ctx.strokeStyle = COLORS.primary;
                ctx.shadowColor = 'rgba(187, 134, 252, 0.5)';
                ctx.shadowBlur = 8;
                ctx.stroke();
                ctx.shadowBlur = 0;

                // Точки на графике
                ctx.fillStyle = COLORS.primary;
                importantPoints.forEach(point => {
                    const xCoord = x(point.index);
                    const yCoord = y(prices[point.index]);
                    ctx.beginPath();
                    ctx.arc(xCoord, yCoord, 8, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = COLORS.background;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                });

                // Подписи цен для важных точек
                ctx.fillStyle = COLORS.text;
                ctx.textBaseline = 'bottom';
                ctx.font = 'bold 13px sans-serif';

                importantPoints.forEach(point => {
                    const xCoord = x(point.index);
                    const yCoord = y(prices[point.index]);

                    // Проверка наложения
                    let canDraw = true;
                    for (const pos of drawnPositions) {
                        if (Math.abs(xCoord - pos) < 40) {
                            canDraw = false;
                            break;
                        }
                    }

                    if (canDraw) {
                        ctx.fillStyle = COLORS.primary;
                        ctx.fillText(point.label, xCoord, yCoord - 12);
                        drawnPositions.push(xCoord);
                    }
                });
            }, 100);
        }

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Закрыть';
        closeBtn.style.cssText = `
            display: block;
            margin: 15px auto 0;
            padding: 10px 25px;
            background: linear-gradient(45deg, ${COLORS.primary}, ${COLORS.primaryVariant});
            color: ${COLORS.background};
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.2s;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        `;
        closeBtn.addEventListener('mouseover', () => {
            closeBtn.style.transform = 'scale(1.03)';
            closeBtn.style.boxShadow = '0 6px 12px rgba(0,0,0,0.3)';
        });
        closeBtn.addEventListener('mouseout', () => {
            closeBtn.style.transform = 'scale(1)';
            closeBtn.style.boxShadow = '0 4px 10px rgba(0,0,0,0.2)';
        });
        closeBtn.addEventListener('click', () => modal.remove());
        modalContent.appendChild(closeBtn);

        document.body.appendChild(modal);
    }

    // Создание панели управления
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
            background: ${COLORS.surface};
            border-radius: 12px;
            padding: 0;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            width: 380px;
            max-height: 80vh;
            overflow: hidden;
            border: 1px solid rgba(255,255,255,0.1);
            display: flex;
            flex-direction: column;
            color: ${COLORS.text};
            transform: translateY(10px);
            animation: slideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        `;

        const header = document.createElement('div');
        header.innerHTML = `<span style="font-size: 20px; margin-right: 8px;">⚡</span> Ozon Enhancer`;
        header.style.cssText = `
            font-weight: 600;
            font-size: 16px;
            padding: 14px 16px;
            background: linear-gradient(45deg, ${COLORS.background}, rgba(30,30,30,0.9));
            color: ${COLORS.primary};
            display: flex;
            align-items: center;
            gap: 8px;
            position: relative;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            text-shadow: 0 0 10px rgba(187, 134, 252, 0.3);
        `;

        panel.appendChild(header);

        const tabContainer = document.createElement('div');
        tabContainer.id = 'ozon-tab-container';
        tabContainer.style.cssText = `
            display: flex;
            background: ${COLORS.background};
            border-bottom: 1px solid rgba(255,255,255,0.1);
        `;

        const createTab = (id, label) => {
            const tab = document.createElement('div');
            tab.dataset.tab = id;
            tab.textContent = label;
            tab.style.cssText = `
                padding: 12px 16px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s;
                border-bottom: 2px solid transparent;
                flex: 1;
                text-align: center;
            `;

            if (currentTab === id) {
                tab.style.borderBottomColor = COLORS.primary;
                tab.style.color = COLORS.primary;
                tab.style.background = 'rgba(187, 134, 252, 0.1)';
            } else {
                tab.style.color = COLORS.textSecondary;
            }

            tab.addEventListener('click', () => {
                currentTab = id;
                CONFIG.currentPanelTab = id;
                refreshPanel();
            });

            return tab;
        };

        tabContainer.appendChild(createTab('settings', 'Настройки'));
        tabContainer.appendChild(createTab('tracking', 'Отслеживание'));

        panel.appendChild(tabContainer);

        const contentContainer = document.createElement('div');
        contentContainer.id = 'ozon-panel-content';
        contentContainer.style.cssText = `
            padding: 0;
            overflow-y: auto;
            flex-grow: 1;
        `;
        panel.appendChild(contentContainer);

        document.body.appendChild(panel);
        refreshPanel();

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.title = 'Закрыть панель';
        closeBtn.style.cssText = `
            position: absolute;
            top: 14px;
            right: 14px;
            background: rgba(255,255,255,0.1);
            border: none;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: ${COLORS.text};
            font-size: 20px;
            line-height: 1;
            transition: all 0.2s;
        `;
        closeBtn.addEventListener('mouseover', () => {
            closeBtn.style.background = 'rgba(255,255,255,0.2)';
            closeBtn.style.transform = 'rotate(90deg)';
        });
        closeBtn.addEventListener('mouseout', () => {
            closeBtn.style.background = 'rgba(255,255,255,0.1)';
            closeBtn.style.transform = 'rotate(0)';
        });
        closeBtn.addEventListener('click', () => {
            panel.style.animation = 'fadeOut 0.3s forwards';
            setTimeout(() => {
                panel.remove();
                panelCreated = false;
            }, 300);
        });
        header.appendChild(closeBtn);

        return panel;
    }

    // Обновление содержимого панели
    function refreshPanel() {
        if (!panelCreated) return;

        const tabContainer = document.getElementById('ozon-tab-container');
        if (tabContainer) {
            const tabs = tabContainer.querySelectorAll('[data-tab]');
            tabs.forEach(tab => {
                if (tab.dataset.tab === currentTab) {
                    tab.style.borderBottomColor = COLORS.primary;
                    tab.style.color = COLORS.primary;
                    tab.style.background = 'rgba(187, 134, 252, 0.1)';
                } else {
                    tab.style.borderBottomColor = 'transparent';
                    tab.style.color = COLORS.textSecondary;
                    tab.style.background = 'transparent';
                }
            });
        }

        const contentContainer = document.getElementById('ozon-panel-content');
        if (!contentContainer) return;

        contentContainer.innerHTML = '';

        switch (currentTab) {
            case 'settings':
                renderSettingsTab(contentContainer);
                break;
            case 'tracking':
                renderTrackingTab(contentContainer);
                break;
        }
    }

    // Рендер вкладки настроек
    function renderSettingsTab(container) {
        const settingsContainer = document.createElement('div');
        settingsContainer.style.padding = '16px';
        container.appendChild(settingsContainer);

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
            checked => CONFIG.trackPrices = checked
        ));

        settingsContainer.appendChild(createToggle(
            'Уведомления о снижении цен',
            '🔔',
            CONFIG.priceDropNotifications,
            checked => CONFIG.priceDropNotifications = checked
        ));
    }

    // Рендер вкладки отслеживания
    function renderTrackingTab(container) {
        const trackingContainer = document.createElement('div');
        trackingContainer.style.padding = '16px';
        container.appendChild(trackingContainer);

        const headerRow = document.createElement('div');
        headerRow.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        `;

        const title = document.createElement('div');
        title.textContent = 'Отслеживание цен';
        title.style.cssText = `
            font-weight: 600;
            font-size: 15px;
        `;
        headerRow.appendChild(title);

        const stats = document.createElement('div');
        stats.textContent = `${CONFIG.trackedItems.length} из ${CONFIG.maxTrackedItems}`;
        stats.style.cssText = `
            font-size: 13px;
            color: ${COLORS.textSecondary};
        `;
        headerRow.appendChild(stats);
        trackingContainer.appendChild(headerRow);

        const actionsRow = document.createElement('div');
        actionsRow.style.cssText = `
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
        `;

        const refreshButton = document.createElement('button');
        refreshButton.textContent = 'Обновить цены';
        refreshButton.style.cssText = `
            background: rgba(255,255,255,0.1);
            border: none;
            padding: 10px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            color: ${COLORS.text};
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: all 0.2s;
        `;
        refreshButton.innerHTML = '🔄 ' + refreshButton.textContent;
        refreshButton.addEventListener('mouseover', () => {
            refreshButton.style.background = 'rgba(255,255,255,0.15)';
            refreshButton.style.transform = 'translateY(-1px)';
        });
        refreshButton.addEventListener('mouseout', () => {
            refreshButton.style.background = 'rgba(255,255,255,0.1)';
            refreshButton.style.transform = 'none';
        });
        refreshButton.addEventListener('click', () => {
            refreshButton.textContent = 'Обновление...';
            refreshButton.disabled = true;
            checkTrackedPrices(true);
            setTimeout(() => {
                refreshButton.textContent = 'Обновить цены';
                refreshButton.disabled = false;
            }, 3000);
        });
        actionsRow.appendChild(refreshButton);

        if (location.pathname.includes('/product/')) {
            const addButton = document.createElement('button');
            addButton.textContent = 'Добавить текущий';
            addButton.style.cssText = `
                background: linear-gradient(45deg, ${COLORS.primary}, ${COLORS.primaryVariant});
                color: ${COLORS.background};
                border: none;
                padding: 10px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                font-weight: 500;
                transition: all 0.2s;
                box-shadow: 0 4px 10px rgba(0,0,0,0.2);
            `;
            addButton.innerHTML = '➕ ' + addButton.textContent;
            addButton.addEventListener('mouseover', () => {
                addButton.style.transform = 'scale(1.03)';
                addButton.style.boxShadow = '0 6px 12px rgba(0,0,0,0.3)';
            });
            addButton.addEventListener('mouseout', () => {
                addButton.style.transform = 'none';
                addButton.style.boxShadow = '0 4px 10px rgba(0,0,0,0.2)';
            });
            addButton.addEventListener('click', () => trackCurrentProduct() && refreshPanel());
            actionsRow.appendChild(addButton);
        }

        trackingContainer.appendChild(actionsRow);

        const manualAddForm = document.createElement('div');
        manualAddForm.style.cssText = `
            display: flex;
            gap: 8px;
            margin: 12px 0 20px;
        `;

        const articleInput = document.createElement('input');
        articleInput.type = 'text';
        articleInput.placeholder = 'Введите артикул товара';
        articleInput.style.cssText = `
            flex-grow: 1;
            padding: 10px;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            font-size: 13px;
            background: rgba(255,255,255,0.05);
            color: ${COLORS.text};
            outline: none;
            transition: all 0.2s;
        `;
        articleInput.addEventListener('focus', () => {
            articleInput.style.borderColor = COLORS.primary;
            articleInput.style.boxShadow = `0 0 0 2px ${COLORS.primary}33`;
        });
        articleInput.addEventListener('blur', () => {
            articleInput.style.borderColor = 'rgba(255,255,255,0.1)';
            articleInput.style.boxShadow = 'none';
        });

        const manualAddButton = document.createElement('button');
        manualAddButton.textContent = 'Добавить';
        manualAddButton.style.cssText = `
            background: linear-gradient(45deg, ${COLORS.primary}, ${COLORS.primaryVariant});
            color: ${COLORS.background};
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            transition: all 0.2s;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        `;
        manualAddButton.addEventListener('mouseover', () => {
            manualAddButton.style.transform = 'scale(1.03)';
            manualAddButton.style.boxShadow = '0 6px 12px rgba(0,0,0,0.3)';
        });
        manualAddButton.addEventListener('mouseout', () => {
            manualAddButton.style.transform = 'none';
            manualAddButton.style.boxShadow = '0 4px 10px rgba(0,0,0,0.2)';
        });
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
                    articleInput.value = '';
                    refreshPanel();
                }
            });
        });

        manualAddForm.appendChild(articleInput);
        manualAddForm.appendChild(manualAddButton);
        trackingContainer.appendChild(manualAddForm);

        const trackedItemsContainer = document.createElement('div');
        trackedItemsContainer.id = 'ozon-tracked-items';
        trackedItemsContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
            max-height: 300px;
            overflow-y: auto;
            padding-right: 4px;
        `;

        if (CONFIG.trackedItems.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.textContent = 'Нет отслеживаемых товаров';
            emptyState.style.cssText = `
                text-align: center;
                padding: 30px 15px;
                color: ${COLORS.textSecondary};
                font-size: 13px;
                background: rgba(255,255,255,0.03);
                border-radius: 8px;
            `;
            trackedItemsContainer.appendChild(emptyState);
        } else {
            CONFIG.trackedItems.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.style.cssText = `
                    background: linear-gradient(45deg, rgba(30,30,30,0.8), rgba(50,50,50,0.4));
                    border-radius: 8px;
                    padding: 12px;
                    position: relative;
                    transition: all 0.2s;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
                `;
                itemEl.addEventListener('mouseover', () => {
                    itemEl.style.transform = 'translateY(-2px)';
                    itemEl.style.boxShadow = '0 6px 12px rgba(0,0,0,0.2)';
                });
                itemEl.addEventListener('mouseout', () => {
                    itemEl.style.transform = 'none';
                    itemEl.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)';
                });

                const itemName = document.createElement('a');
                itemName.href = item.url;
                itemName.textContent = item.name.length > 40 ? item.name.substring(0, 40) + '...' : item.name;
                itemName.title = item.name;
                itemName.target = '_blank';
                itemName.style.cssText = `
                    font-weight: 500;
                    display: block;
                    margin-bottom: 8px;
                    text-decoration: none;
                    color: ${COLORS.primary};
                    font-size: 14px;
                    transition: all 0.2s;
                `;
                itemName.addEventListener('mouseover', () => {
                    itemName.style.textShadow = `0 0 8px ${COLORS.primary}80`;
                });
                itemName.addEventListener('mouseout', () => {
                    itemName.style.textShadow = 'none';
                });

                const priceInfo = document.createElement('div');
                const initialPrice = item.initialPrice;
                const currentPrice = item.currentPrice;
                const diff = currentPrice - initialPrice;
                const diffPercent = ((Math.abs(diff) / initialPrice) * 100).toFixed(1);

                priceInfo.innerHTML = `
                    <div style="font-size: 16px; font-weight: 700; color: ${diff < 0 ? COLORS.success : COLORS.text}">
                        ${currentPrice.toFixed(2)} BYN
                    </div>
                    <div style="font-size: 13px; color: ${COLORS.textSecondary}; margin-top: 4px;">
                        ${diff === 0 ? 'Без изменений' :
                         diff < 0 ? `▼ -${Math.abs(diff).toFixed(2)} BYN (${diffPercent}%)` :
                         `▲ +${diff.toFixed(2)} BYN (${diffPercent}%)`}
                    </div>
                    <div style="font-size: 12px; color: ${COLORS.textSecondary}; margin-top: 2px;">
                        Добавлен: ${new Date(item.addedDate).toLocaleDateString()}
                    </div>
                `;

                const buttonsContainer = document.createElement('div');
                buttonsContainer.style.cssText = `
                    display: flex;
                    justify-content: flex-end;
                    gap: 6px;
                    margin-top: 10px;
                `;

                const chartBtn = document.createElement('button');
                chartBtn.title = 'Показать график цены';
                chartBtn.style.cssText = `
                    padding: 6px 12px;
                    background: rgba(255,255,255,0.1);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                    color: ${COLORS.text};
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                `;
                chartBtn.innerHTML = '📈 График';
                chartBtn.addEventListener('mouseover', () => {
                    chartBtn.style.background = 'rgba(255,255,255,0.15)';
                    chartBtn.style.transform = 'translateY(-1px)';
                });
                chartBtn.addEventListener('mouseout', () => {
                    chartBtn.style.background = 'rgba(255,255,255,0.1)';
                    chartBtn.style.transform = 'none';
                });
                chartBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    showPriceChart(item);
                });

                const removeBtn = document.createElement('button');
                removeBtn.title = 'Удалить из отслеживания';
                removeBtn.style.cssText = `
                    padding: 6px 12px;
                    background: rgba(255, 100, 100, 0.1);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                    color: ${COLORS.error};
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                `;
                removeBtn.innerHTML = '✕ Удалить';
                removeBtn.addEventListener('mouseover', () => {
                    removeBtn.style.background = 'rgba(255, 100, 100, 0.2)';
                    removeBtn.style.transform = 'translateY(-1px)';
                });
                removeBtn.addEventListener('mouseout', () => {
                    removeBtn.style.background = 'rgba(255, 100, 100, 0.1)';
                    removeBtn.style.transform = 'none';
                });
                removeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    removeTrackedItem(item.article);
                    refreshPanel();
                });

                buttonsContainer.appendChild(chartBtn);
                buttonsContainer.appendChild(removeBtn);

                itemEl.appendChild(itemName);
                itemEl.appendChild(priceInfo);
                itemEl.appendChild(buttonsContainer);
                trackedItemsContainer.appendChild(itemEl);
            });
        }

        trackingContainer.appendChild(trackedItemsContainer);

        if (CONFIG.lastPriceCheckTime) {
            const lastCheckTime = new Date(CONFIG.lastPriceCheckTime);
            const lastCheck = document.createElement('div');
            lastCheck.textContent = `Последняя проверка: ${lastCheckTime.toLocaleDateString('ru-RU')} ${lastCheckTime.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}`;
            lastCheck.style.cssText = `
                font-size: 12px;
                color: ${COLORS.textSecondary};
                text-align: right;
                margin-top: 10px;
            `;
            trackingContainer.appendChild(lastCheck);
        }
    }

    // Создание переключателя
    function createToggle(label, icon, checked, onChange) {
        const container = document.createElement('div');
        container.style.cssText = `
            display: flex;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        `;

        const iconEl = document.createElement('div');
        iconEl.textContent = icon;
        iconEl.style.cssText = `
            font-size: 18px;
            margin-right: 10px;
            width: 22px;
            text-align: center;
            transition: all 0.3s;
        `;
        container.appendChild(iconEl);

        const textContainer = document.createElement('div');
        textContainer.style.flex = '1';

        const labelEl = document.createElement('div');
        labelEl.textContent = label;
        labelEl.style.cssText = `
            font-weight: 500;
            font-size: 13px;
            color: ${COLORS.text};
            transition: all 0.3s;
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
            background-color: #444;
            transition: .4s;
            border-radius: 22px;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.3);
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
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        `;

        toggleSlider.appendChild(toggleKnob);
        toggleContainer.appendChild(toggleInput);
        toggleContainer.appendChild(toggleSlider);
        container.appendChild(toggleContainer);

        const updateToggleStyle = () => {
            if (toggleInput.checked) {
                toggleSlider.style.backgroundColor = COLORS.primary;
                toggleSlider.style.boxShadow = `inset 0 0 8px ${COLORS.primary}80`;
                toggleKnob.style.transform = 'translateX(18px)';
                iconEl.style.textShadow = `0 0 8px ${COLORS.primary}80`;
                iconEl.style.transform = 'scale(1.1)';
            } else {
                toggleSlider.style.backgroundColor = '#444';
                toggleSlider.style.boxShadow = 'inset 0 1px 3px rgba(0,0,0,0.3)';
                toggleKnob.style.transform = 'translateX(0)';
                iconEl.style.textShadow = 'none';
                iconEl.style.transform = 'scale(1)';
            }
        };
        toggleInput.addEventListener('change', updateToggleStyle);
        updateToggleStyle();

        return container;
    }

    // Создание кнопки активации панели
    function createPanelToggle() {
        if (document.getElementById('ozon-enhancer-toggle')) return;

        const toggle = document.createElement('button');
        toggle.id = 'ozon-enhancer-toggle';
        toggle.innerHTML = '<span style="font-size: 16px; margin-right: 6px;">⚡</span> Ozon Enhancer';
        toggle.addEventListener('click', createControlPanel);
        document.body.appendChild(toggle);
        return toggle;
    }

    // Проверка, открыта ли галерея изображений
    function isGalleryOpen() {
        for (const selector of SELECTORS.gallerySelectors) {
            if (document.querySelector(selector)) {
                return true;
            }
        }
        return false;
    }

    // Сортировка отзывов по рейтингу
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

    // Добавление стилей
    GM_addStyle(`
        #ozon-enhancer-panel {
            transition: all 0.3s ease;
        }

        #ozon-enhancer-toggle {
            position: fixed !important;
            top: 10px !important;
            right: 10px !important;
            background: linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryVariant} 100%) !important;
            color: ${COLORS.background} !important;
            border: none !important;
            border-radius: 6px !important;
            padding: 10px 16px !important;
            cursor: pointer !important;
            z-index: 2147483647 !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            box-shadow: 0 5px 15px rgba(0,0,0,0.4) !important;
            transition: all 0.2s ease !important;
            display: flex;
            align-items: center;
            gap: 6px;
            animation: pulse 2s infinite;
        }

        #ozon-enhancer-toggle:hover {
            background: linear-gradient(135deg, #9a65d1 0%, #5d3a9e 100%) !important;
            transform: translateY(-2px) scale(1.05) !important;
            box-shadow: 0 8px 20px rgba(0,0,0,0.5) !important;
            animation: none;
        }

        #ozon-enhancer-toggle:active {
            transform: translateY(0) scale(1) !important;
        }

        #ozon-tracked-items::-webkit-scrollbar {
            width: 6px;
        }
        #ozon-tracked-items::-webkit-scrollbar-track {
            background: rgba(255,255,255,0.05);
        }
        #ozon-tracked-items::-webkit-scrollbar-thumb {
            background: ${COLORS.primary};
            border-radius: 4px;
        }

        #ozon-panel-content::-webkit-scrollbar {
            width: 6px;
        }
        #ozon-panel-content::-webkit-scrollbar-track {
            background: transparent;
        }
        #ozon-panel-content::-webkit-scrollbar-thumb {
            background: ${COLORS.primary};
            border-radius: 4px;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes scaleIn {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }

        @keyframes slideIn {
            from { transform: translateY(10px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }

        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }

        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(187, 134, 252, 0.5); }
            70% { box-shadow: 0 0 0 10px rgba(187, 134, 252, 0); }
            100% { box-shadow: 0 0 0 0 rgba(187, 134, 252, 0); }
        }
    `);

    // Обработчики изменения URL
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

    // Инициализация скрипта
    function init() {
        createPanelToggle();
        sortReviews();
        expandDescription();

        const observer = new MutationObserver(() => {
            createPanelToggle();
            isDescriptionExpanded = false;
            expandDescription();

            // Скрываем кнопку при открытии галереи
            const toggleBtn = document.getElementById('ozon-enhancer-toggle');
            if (toggleBtn) {
                toggleBtn.style.display = isGalleryOpen() ? 'none' : 'flex';
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Периодическая попытка раскрыть описание
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

        // Периодическая проверка цен
        setInterval(() => checkTrackedPrices(), 6 * 60 * 60 * 1000);
        setTimeout(() => checkTrackedPrices(), 60000);

        // Периодическая проверка состояния галереи
        setInterval(() => {
            const toggleBtn = document.getElementById('ozon-enhancer-toggle');
            if (toggleBtn) {
                toggleBtn.style.display = isGalleryOpen() ? 'none' : 'flex';
            }
        }, 1000);
    }

    // Запуск скрипта
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 1000);
    }

    // Обработка смены URL
    window.addEventListener('locationchange', () => {
        isSortingApplied = false;
        isDescriptionExpanded = false;
        sortReviews();
        expandDescription();
        if (panelCreated) refreshPanel();
    });
})();

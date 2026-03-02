const GITHUB_CSV_URL = 'https://raw.githubusercontent.com/posekw/Perfumer-App/main/data/ingredients_db.txt';
const STATUS_URL = 'https://raw.githubusercontent.com/posekw/Perfumer-App/main/status.txt';

async function checkLicense() {
    try {
        const response = await fetch(`${STATUS_URL}?t=${Date.now()}`);
        const statusText = await response.text();
        if (!statusText.includes('STATUS=ACTIVE')) {
            document.body.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#0d0d0d; color:#d4af37; font-family:sans-serif; text-align:center; padding:2rem;">
                    <h1 style="font-size:3rem; margin-bottom:1rem;">⚠️</h1>
                    <h2>عذراً، لقد تم إيقاف هذه النسخة من قبل المطور.</h2>
                    <p style="color:#a0a0a0; margin-top:1rem;">يرجى مراجعة المطور للحصول على التحديثات.</p>
                </div>
            `;
            throw new Error('License deactivated');
        }
    } catch (error) {
        console.error('License check failed:', error);
    }
}

function parseCSV(csvText) {
    if (csvText.charCodeAt(0) === 0xFEFF) {
        csvText = csvText.slice(1);
    }
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.replace(/[\r\n\uFEFF]/g, '').trim());
    const parseRow = (row) => {
        const matches = row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
        return matches ? matches.map(m => m.replace(/^"|"$/g, '').trim()) : [];
    };

    return lines.slice(1).map(line => {
        const values = parseRow(line);
        const ing = {};
        headers.forEach((header, i) => ing[header] = values[i]);
        return {
            id: parseInt(ing.id),
            name_en: ing.name_en,
            category_ar: ing.category_ar,
            description_en: ing.description_en,
            note_type: ing.note_type,
            intensity: parseInt(ing.intensity_1_10) || 5,
            power_factor: parseInt(ing.power_factor) || parseInt(ing.intensity_1_10) || 5,
            diffusion: parseInt(ing.diffusion) || 5,
            substantivity: parseInt(ing.substantivity) || (ing.note_type === 'Top' ? 2 : ing.note_type === 'Heart' ? 12 : 48),
            ifra: parseFloat(ing.ifra_limit) || 100
        };
    });
}

async function loadIngredients() {
    try {
        const response = await fetch(`${GITHUB_CSV_URL}?t=${Date.now()}`);
        if (!response.ok) throw new Error('Remote fetch failed');
        const csvText = await response.text();
        return parseCSV(csvText);
    } catch (error) {
        console.warn('Falling back to local database...', error);
        try {
            // Try .csv first locally, then .txt
            let localResponse = await fetch('data/ingredients_db.csv');
            if (!localResponse.ok) localResponse = await fetch('data/ingredients_db.txt');
            if (!localResponse.ok) return [];
            const localCsvText = await localResponse.text();
            return parseCSV(localCsvText);
        } catch (e) {
            console.error('Local fallback failed:', e);
            return [];
        }
    }
}

let allIngredients = [];
let currentFormula = [];

const ingredientList = document.getElementById('ingredient-list');
const searchInput = document.getElementById('ingredient-search');
const perfumeWeightInput = document.getElementById('perfume-weight');
const concentrationInput = document.getElementById('concentration');
const formulaBody = document.getElementById('formula-body');
const totalOilDisplay = document.getElementById('total-oil-weight');
const solventDisplay = document.getElementById('solvent-weight');
const ifraStatus = document.getElementById('ifra-status');
const totalIngredientsCount = document.getElementById('total-ingredients');
const aiSuggestBtn = document.getElementById('ai-suggest-btn');
const aiTips = document.getElementById('ai-tips');

// Modal Elements
const infoModal = document.getElementById('info-modal');
const infoBtn = document.getElementById('info-btn');
const closeBtn = document.querySelector('.close-modal');

function renderIngredients(ingredients) {
    console.log("Rendering ingredients:", ingredients.length);
    ingredientList.innerHTML = '';
    ingredients.forEach(ing => {
        const div = document.createElement('div');
        div.className = 'ingredient-item';

        const casLabel = ing.cas ? `<span class="badge cas-badge">CAS: ${ing.cas}</span>` : '';
        const ifraLabel = `<span class="badge ifra-badge">IFRA: ${ing.ifra}%</span>`;

        div.innerHTML = `
            <div class="ingredient-info">
                <div class="ing-header-row">
                    <h4 class="ing-name">${ing.name_en}</h4>
                    <span class="note-tag">[${ing.note_type}]</span>
                    <div class="badges-container">
                        ${casLabel}
                        ${ifraLabel}
                    </div>
                </div>
                <div class="ing-details">
                    <span class="cat-tag">${ing.category_ar}</span>
                    <span class="desc-text">${ing.description_en}</span>
                </div>
            </div>
            <button class="add-btn" onclick="addToFormula(${ing.id})">+</button>
        `;
        ingredientList.appendChild(div);
    });
}

window.addToFormula = (id) => {
    const ingredient = allIngredients.find(ing => ing.id === id);
    if (!ingredient) return;
    if (currentFormula.find(item => item.id === id)) return;

    currentFormula.push({
        ...ingredient,
        weight: 0,
        dilution: 100, // New: Dilution percentage (default neat)
        percentage: 0
    });

    renderFormula();
    calculateTotals();
};

window.removeFromFormula = (id) => {
    currentFormula = currentFormula.filter(item => item.id !== id);
    renderFormula();
    calculateTotals();
};

// Removed toggleDominance

window.updateWeight = (id, weight) => {
    const item = currentFormula.find(item => item.id === id);
    if (item) {
        item.weight = parseFloat(weight) || 0;
        calculateTotals();
    }
};

window.updateDilution = (id, dilution) => {
    const item = currentFormula.find(item => item.id === id);
    if (item) {
        let val = parseFloat(dilution) || 100;
        item.dilution = Math.min(Math.max(val, 0.01), 100);
        calculateTotals();
    }
};

function renderFormula() {
    formulaBody.innerHTML = '';
    currentFormula.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div style="font-weight: 700; font-size: 1.05rem; color: #ffffff; letter-spacing: 0.3px;">${item.name_en}</div>
                <div style="display: flex; gap: 8px; margin-top: 6px; align-items: center; justify-content: flex-start; direction: ltr;">
                    <span style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 3px 8px; border-radius: 6px; font-size: 0.65rem; color: #b0b0b0; font-family: monospace; letter-spacing: 0.5px;">CAS: ${item.cas || '-'}</span>
                    <span style="background: ${item.ifra < 100 ? 'rgba(76, 209, 55, 0.1)' : 'rgba(212, 175, 55, 0.05)'}; border: 1px solid ${item.ifra < 100 ? 'rgba(76, 209, 55, 0.3)' : 'rgba(212, 175, 55, 0.2)'}; padding: 3px 8px; border-radius: 6px; font-size: 0.65rem; color: ${item.ifra < 100 ? '#4cd137' : '#d4af37'}; font-weight: 700; letter-spacing: 0.5px;">IFRA: ${item.ifra}%</span>
                </div>
            </td>
            <td style="color: var(--accent-color); font-weight: 500; font-size: 0.95rem;">${item.category_ar}</td>
            <td><input type="number" min="0.1" max="100" step="1" class="dilution-input weight-input" id="dilution-${item.id}" value="${item.dilution}" onchange="updateDilution(${item.id}, this.value)" style="width: 60px;"></td>
            <td><input type="number" step="0.01" class="weight-input" id="weight-${item.id}" value="${item.weight.toFixed(2)}" onchange="updateWeight(${item.id}, this.value)"></td>
            <td id="percent-${item.id}" style="font-weight: 600; font-family: monospace; font-size: 1.05rem; color: #ffffff;">${item.percentage.toFixed(2)}%</td>
            <td>
                <button style="background: rgba(255, 77, 77, 0.05); border: 1px solid rgba(255, 77, 77, 0.2); color: #ff4d4d; border-radius: 8px; padding: 6px 10px; cursor:pointer; font-size: 0.9rem; transition: all 0.2s;" 
                        onmouseover="this.style.background='#ff4d4d'; this.style.color='#fff';" 
                        onmouseout="this.style.background='rgba(255, 77, 77, 0.05)'; this.style.color='#ff4d4d';" 
                        onclick="removeFromFormula(${item.id})">✖</button>
            </td>
        `;
        formulaBody.appendChild(row);
    });
}

function calculateTotals() {
    const totalWeight = parseFloat(perfumeWeightInput.value) || 100;
    const concentrationPct = parseFloat(concentrationInput.value) || 20;

    const requiredTotalOil = (concentrationPct / 100) * totalWeight;
    let actualTotalPureOil = 0;
    let totalGrossWeight = 0;
    let ifraViolation = false;

    // First pass to calculate total pure oil
    currentFormula.forEach(item => {
        let pureOil = item.weight * (item.dilution / 100);
        actualTotalPureOil += pureOil;
        totalGrossWeight += item.weight;
    });

    currentFormula.forEach(item => {
        let pureOil = item.weight * (item.dilution / 100);
        item.percentage = actualTotalPureOil > 0 ? (pureOil / actualTotalPureOil) * 100 : 0;

        // IFRA Safety Check based on NET PURE OIL in the final product
        const currentPctInFinal = (pureOil / totalWeight) * 100;

        const percentCell = document.getElementById(`percent-${item.id}`);
        if (percentCell) {
            percentCell.innerText = `${item.percentage.toFixed(2)}%`;
            if (currentPctInFinal > item.ifra) {
                percentCell.style.color = '#ff4d4d';
                percentCell.title = `تنبيه: تجاوز حد IFRA (${item.ifra}%)`;
                ifraViolation = true;
            } else {
                percentCell.style.color = 'inherit';
                percentCell.title = '';
            }
        }

        const weightInput = document.getElementById(`weight-${item.id}`);
        if (weightInput && document.activeElement !== weightInput) {
            weightInput.value = item.weight.toFixed(2);
        }
    });

    totalOilDisplay.innerText = `${actualTotalPureOil.toFixed(2)} جرام`;

    // Solvent weight calculation takes into account the solvent introduced by dilutions
    const introducedSolvent = totalGrossWeight - actualTotalPureOil;
    let requiredSolvent = totalWeight - requiredTotalOil;
    requiredSolvent -= introducedSolvent;

    solventDisplay.innerText = `${Math.max(requiredSolvent, 0).toFixed(2)} جرام`;

    // Scent Pyramid Calculation
    const distribution = { Top: 0, Heart: 0, Base: 0 };
    currentFormula.forEach(item => {
        if (distribution[item.note_type] !== undefined) {
            let pureOil = item.weight * (item.dilution / 100);
            distribution[item.note_type] += pureOil;
        }
    });

    const totalOil = actualTotalPureOil || 1;
    const topPct = (distribution.Top / totalOil) * 100;
    const heartPct = (distribution.Heart / totalOil) * 100;
    const basePct = (distribution.Base / totalOil) * 100;

    document.getElementById('pyramid-top').style.width = `${topPct}%`;
    document.getElementById('pyramid-heart').style.width = `${heartPct}%`;
    document.getElementById('pyramid-base').style.width = `${basePct}%`;

    document.getElementById('top-pct').innerText = topPct.toFixed(0);
    document.getElementById('heart-pct').innerText = heartPct.toFixed(0);
    document.getElementById('base-pct').innerText = basePct.toFixed(0);

    if (actualTotalPureOil > (requiredTotalOil + 0.01) || ifraViolation || requiredSolvent < 0) {
        ifraStatus.innerText = ifraViolation ? 'تنبيه: خرق حدود IFRA' : 'تنبيه: السوائل تتجاوز الوزن الكلي';
        ifraStatus.style.color = '#ff4d4d';
    } else {
        ifraStatus.innerText = 'آمن';
        ifraStatus.style.color = '#4cd137';
    }

    updateEvaluationDashboard(topPct, heartPct, basePct, actualTotalPureOil);
}

function updateEvaluationDashboard(topPct, heartPct, basePct, actualTotalPureOil) {
    if (actualTotalPureOil === 0) return;

    // 1. Balance Score (Target: Top 25%, Heart 35%, Base 40%)
    const topDiff = Math.abs(topPct - 25);
    const heartDiff = Math.abs(heartPct - 35);
    const baseDiff = Math.abs(basePct - 40);

    // Max diff possible is around 150 (e.g. 100% top -> diff: 75 + 35 + 40 = 150)
    let balanceScore = 100 - ((topDiff + heartDiff + baseDiff) / 1.5);
    balanceScore = Math.max(10, balanceScore); // floor at 10%

    const balanceBar = document.getElementById('balance-score-bar');
    const balanceVal = document.getElementById('balance-score-val');
    const balanceTooltip = document.getElementById('balance-tooltip');

    balanceBar.style.width = `${balanceScore}%`;
    balanceVal.innerText = `${balanceScore.toFixed(0)}%`;

    if (balanceScore > 85) {
        balanceBar.style.background = '#4cd137';
        balanceVal.style.color = '#4cd137';
        balanceTooltip.innerText = 'هرم متوازن هندسياً وممتاز';
    } else if (balanceScore > 60) {
        balanceBar.style.background = '#fbc531';
        balanceVal.style.color = '#fbc531';
        balanceTooltip.innerText = 'توازن معقول، قد يحتاج بعض الضبط';
    } else {
        balanceBar.style.background = '#ff4d4d';
        balanceVal.style.color = '#ff4d4d';
        balanceTooltip.innerText = 'اختلال واضح في توزيع الهرم العطري';
    }

    // 2. Signature Strength & Clash Detection
    let signaturePoints = 0;
    let families = new Set();
    let hasGourmand = false;
    let hasMarine = false;
    let hasAnimalic = false;
    let hasFloral = false;

    let subTimelines = { '0h': [], '4h': [], '12h': [] };

    currentFormula.forEach(item => {
        let pureOil = item.weight * (item.dilution / 100);
        let pct = (pureOil / actualTotalPureOil) * 100;

        // High impact materials dosed above 1% add to signature
        if (item.power_factor > 7 && pct > 1) {
            signaturePoints += (item.power_factor * pct) / 50;
        }

        let cat = item.category_ar || '';
        if (cat.includes('حيوان')) hasAnimalic = true;
        if (cat.includes('بحر')) hasMarine = true;
        if (cat.includes('فانيليا') || cat.includes('فواكه')) hasGourmand = true;
        if (cat.includes('زهر')) hasFloral = true;

        // Timeline Allocation based on Substantivity
        if (item.substantivity <= 4 && pct > 5) subTimelines['0h'].push(item.name_en);
        else if (item.substantivity > 4 && item.substantivity <= 24 && pct > 5) subTimelines['4h'].push(item.name_en);
        else if (item.substantivity > 24 && pct > 5) subTimelines['12h'].push(item.name_en);

        // Catch-all timeline if list is empty but item exists
        if (pct >= 5) {
            if (item.substantivity > 24) subTimelines['4h'].push(item.name_en); // Show early base notes in heart too
        }
    });

    let sigScore = Math.min(100, (signaturePoints * 5) + 10);
    const sigBar = document.getElementById('signature-score-bar');
    const sigVal = document.getElementById('signature-score-val');
    const sigTooltip = document.getElementById('signature-tooltip');

    sigBar.style.width = `${sigScore}%`;
    sigVal.innerText = `${sigScore.toFixed(0)}%`;

    if (sigScore > 75) {
        sigTooltip.innerText = 'بصمة قوية، عطر ذو شخصية ملفتة ومميزة';
        sigBar.style.background = '#9c88ff';
        sigVal.style.color = '#9c88ff';
    } else if (sigScore > 40) {
        sigTooltip.innerText = 'بصمة معتدلة، رائحة لطيفة واعتيادية';
        sigBar.style.background = 'var(--accent-color)';
        sigVal.style.color = 'var(--accent-color)';
    } else {
        sigTooltip.innerText = 'بصمة ضعيفة، العطر يفتقر لمكون يبرز هويته';
        sigBar.style.background = '#ccc';
        sigVal.style.color = '#ccc';
    }

    // Clash detection
    const clashEl = document.getElementById('clash-warnings');
    let clashes = [];
    if (hasMarine && hasAnimalic && !hasFloral) {
        clashes.push('تضارب محتمل: نوتات بحرية مع حيوانية قوية قد تنتج رائحة مزعجة (ينصح بإضافة زهور كجسر).');
    }
    if (clashes.length > 0) {
        clashEl.innerHTML = '⚠️ ' + clashes.join('<br>');
        clashEl.style.display = 'block';
    } else {
        clashEl.style.display = 'none';
    }

    // Timeline render
    const displayTop = (arr) => arr.length > 0 ? arr.slice(0, 2).join(', ') + (arr.length > 2 ? '...' : '') : 'غير واضح';
    document.getElementById('evo-0h').innerText = displayTop(subTimelines['0h']);
    document.getElementById('evo-4h').innerText = displayTop(subTimelines['4h']);
    document.getElementById('evo-12h').innerText = displayTop(subTimelines['12h']);
}

// AI Ratio Suggestion Logic
aiSuggestBtn.addEventListener('click', () => {
    if (currentFormula.length === 0) {
        alert('برجاء إضافة مكونات أولاً!');
        return;
    }

    const totalWeight = parseFloat(perfumeWeightInput.value) || 100;
    const concentrationPct = parseFloat(concentrationInput.value) || 20;
    const targetOilWeight = (concentrationPct / 100) * totalWeight;

    // Distribute weights using Power Factor and Dominance
    let totalScore = 0;
    currentFormula.forEach(item => {
        let score = 1;

        // Base distribution geometry (approximating 25/35/40 rule)
        if (item.note_type === 'Top') score = 25;
        else if (item.note_type === 'Heart') score = 35;
        else score = 40; // Base

        // Reverse scale by power factor: 
        // Extremely potent materials need LESS volume to be perceived equivalently
        let pwrFactor = item.power_factor || 5;
        score = score / (pwrFactor / 2); // if power is 10, divide by 5. If power is 2, divide by 1.

        item.tempScore = score;
        totalScore += score;
    });

    currentFormula.forEach(item => {
        // Required pure oil weight
        let targetPureOil = (item.tempScore / totalScore) * targetOilWeight;
        // Convert to gross weight based on dilution (Gross = Net / (Dilution% / 100))
        item.weight = targetPureOil / (item.dilution / 100);
    });

    aiTips.style.display = 'block';
    aiTips.innerHTML = `
        <strong>الحساب الذكي المتقدم:</strong> تم ضبط أوزان المكونات استناداً إلى قاعدة توازن (25-35-40) مع مراعاة قوة انتشار المادة (Power Factor) ونسب التخفيف لضمان ألا يطغى مكون قوي جداً على بقية الهرم.
    `;

    renderFormula();
    calculateTotals();
});

// Gemini AI Integration
const geminiBtn = document.getElementById('gemini-generate-btn');
const geminiInput = document.getElementById('ai-prompt-input');
const aiLoading = document.getElementById('ai-loading-indicator');
const aiError = document.getElementById('ai-error-msg');
const GEMINI_API_KEY = 'AIzaSyDBKd9aUHFCIBvT_NDZs03ZhVb71ipnHLQ';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

geminiBtn.addEventListener('click', async () => {
    const promptText = geminiInput.value.trim();
    if (!promptText) {
        aiError.innerText = 'الرجاء كتابة قصة إو إلهام للعطر أولاً.';
        aiError.style.display = 'block';
        return;
    }

    aiError.style.display = 'none';
    aiLoading.style.display = 'block';
    geminiBtn.disabled = true;

    // Prepare ingredients list catalogue for the AI
    const catalogue = allIngredients.map(i => `${i.id}: ${i.name_en} (${i.category_ar}) - ${i.note_type}`).join('\n');

    const systemInstruction = `
أنت خبير عطور عالمي (Master Perfumer). المستخدم سيعطيك قصة أو وصف لعطر يريد تصميمه.
عليك ابتكار تركيبة عطرية تلتزم بالتوازن المثالي (القمة 25%، القلب 35%، القاعدة 40%).
المكونات المتاحة للاختيار منها (اختر فقط من هذه القائمة بناءً على الوصف المعطى):
${catalogue}
    `;

    try {
        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: systemInstruction },
                        { text: `وصف العطر المطلوب: ${promptText}` }
                    ]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 800,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                id: { type: "INTEGER", description: "رقم تعريف المكون من القائمة" },
                                percentage: { type: "NUMBER", description: "النسبة المئوية للمكون في العطر، يجب أن يكون مجموع كل النسب 100" }
                            },
                            required: ["id", "percentage"]
                        }
                    }
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'فشل الاتصال بـ Gemini API');
        }

        const aiResponseText = data.candidates[0].content.parts[0].text;

        let suggestedFormula = [];
        try {
            suggestedFormula = JSON.parse(aiResponseText);
        } catch (e) {
            console.warn("Standard JSON parse failed, attempting regex extraction...", e);
            // Fallback: Manually extract id and percentage pairs from the raw text
            // Matches {"id": 12, "percentage": 15.5} or {id: 12, percentage: 15}
            const regex = /["']?id["']?\s*:\s*(\d+)\s*,\s*["']?percentage["']?\s*:\s*([\d.]+)/gi;
            let match;
            while ((match = regex.exec(aiResponseText)) !== null) {
                suggestedFormula.push({
                    id: parseInt(match[1]),
                    percentage: parseFloat(match[2])
                });
            }
        }

        if (!Array.isArray(suggestedFormula)) throw new Error('تنسيق البيانات غير صحيح');

        // Clear current formula and load the new one
        currentFormula = [];
        const targetOilWeight = (parseFloat(concentrationInput.value) || 20) / 100 * (parseFloat(perfumeWeightInput.value) || 100);

        suggestedFormula.forEach(item => {
            const ing = allIngredients.find(i => i.id === item.id || parseInt(i.id) === parseInt(item.id));
            if (ing) {
                // Determine pure oil weight based on the suggested percentage
                let targetPureOil = (parseFloat(item.percentage) / 100) * targetOilWeight;

                // Assuming neat (100% dilution) for a fresh generated formula
                currentFormula.push({
                    ...ing,
                    weight: targetPureOil,
                    dilution: 100,
                    percentage: parseFloat(item.percentage)
                });
            }
        });

        if (currentFormula.length === 0) {
            throw new Error('لم يتمكن الذكاء الاصطناعي من اختيار مكونات مطابقة للقائمة.');
        }

        renderFormula();
        calculateTotals();

        aiTips.innerHTML = `<strong>صانع العطور الذكي (Gemini):</strong> تم تصميم هذه التركيبة خصيصاً لك بناءً على الوصف المقدم.`;
        aiTips.style.display = 'block';

    } catch (e) {
        console.error("Gemini AI Error:", e);
        aiError.innerText = `حدث خطأ أثناء معالجة طلبك: ${e.message}`;
        aiError.style.display = 'block';
    } finally {
        aiLoading.style.display = 'none';
        geminiBtn.disabled = false;
    }
});

// Modal Logic
infoBtn.onclick = () => infoModal.style.display = "block";
closeBtn.onclick = () => infoModal.style.display = "none";
window.onclick = (e) => { if (e.target == infoModal) infoModal.style.display = "none"; };

searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allIngredients.filter(ing =>
        ing.name_en.toLowerCase().includes(term) ||
        ing.category_ar.includes(term) ||
        ing.description_en.toLowerCase().includes(term) ||
        ing.note_type.toLowerCase().includes(term)
    );
    renderIngredients(filtered);
});

perfumeWeightInput.addEventListener('input', calculateTotals);
concentrationInput.addEventListener('input', calculateTotals);

// Removed recipe management

document.addEventListener('DOMContentLoaded', async () => {
    await checkLicense();
    allIngredients = await loadIngredients();
    renderIngredients(allIngredients);

    if (totalIngredientsCount) {
        totalIngredientsCount.innerText = `الإجمالي: ${allIngredients.length} مكون`;
    }

    const dateDisplay = document.getElementById('current-date');
    const now = new Date();
    dateDisplay.innerText = now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
});

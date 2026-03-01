async function loadIngredients() {
    try {
        // Use the plugin URL passed from WordPress
        const baseUrl = typeof perfumerData !== 'undefined' ? perfumerData.pluginUrl : '';
        const response = await fetch(baseUrl + 'data/ingredients_db.csv');
        const csvText = await response.text();

        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());

        // Robust CSV row parser for quoted fields
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
                intensity: parseInt(ing.intensity_1_10) || 5
            };
        });
    } catch (error) {
        console.error('Error loading CSV database:', error);
        return [];
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
    if (!ingredientList) return;
    ingredientList.innerHTML = '';
    ingredients.forEach(ing => {
        const div = document.createElement('div');
        div.className = 'ingredient-item';
        div.innerHTML = `
            <div class="ingredient-info">
                <h4>${ing.name_en} <span style="font-size:0.7rem; color: #d4af37;">[${ing.note_type}]</span></h4>
                <p style="font-size:0.8rem; color: #a0a0a0;">${ing.category_ar} - ${ing.description_en}</p>
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
        percentage: 0,
        dominanceLevel: 0 // 0 to 3
    });

    renderFormula();
    calculateTotals();
};

window.removeFromFormula = (id) => {
    currentFormula = currentFormula.filter(item => item.id !== id);
    renderFormula();
    calculateTotals();
};

window.toggleDominance = (id) => {
    const item = currentFormula.find(item => item.id === id);
    if (item) {
        item.dominanceLevel = (item.dominanceLevel + 1) % 4; // Cycle 0, 1, 2, 3
        renderFormula();
    }
};

window.updateWeight = (id, weight) => {
    const item = currentFormula.find(item => item.id === id);
    if (item) {
        item.weight = parseFloat(weight) || 0;
        calculateTotals();
    }
};

function renderFormula() {
    if (!formulaBody) return;
    formulaBody.innerHTML = '';
    currentFormula.forEach(item => {
        const row = document.createElement('tr');
        const stars = '⭐'.repeat(item.dominanceLevel) || '☆';
        row.innerHTML = `
            <td>${item.name_en}</td>
            <td>${item.category_ar}</td>
            <td style="text-align:center;">
                <span class="dominant-star ${item.dominanceLevel > 0 ? 'active' : ''}" 
                      onclick="toggleDominance(${item.id})" 
                      style="cursor:pointer; font-size:1.1rem; filter: ${item.dominanceLevel > 0 ? 'none' : 'grayscale(1) opacity(0.3)'};">
                      ${stars}
                </span>
            </td>
            <td><input type="number" class="weight-input" id="weight-${item.id}" value="${item.weight.toFixed(2)}" onchange="updateWeight(${item.id}, this.value)"></td>
            <td id="percent-${item.id}">${item.percentage.toFixed(2)}%</td>
            <td><button style="background:transparent; border:none; color:#ff4d4d; cursor:pointer;" onclick="removeFromFormula(${item.id})">🗑️</button></td>
        `;
        formulaBody.appendChild(row);
    });
}

function calculateTotals() {
    if (!perfumeWeightInput || !concentrationInput) return;
    const totalWeight = parseFloat(perfumeWeightInput.value) || 100;
    const concentrationPct = parseFloat(concentrationInput.value) || 20;

    const requiredTotalOil = (concentrationPct / 100) * totalWeight;
    let actualTotalOil = currentFormula.reduce((sum, item) => sum + item.weight, 0);

    currentFormula.forEach(item => {
        item.percentage = actualTotalOil > 0 ? (item.weight / actualTotalOil) * 100 : 0;
        const percentCell = document.getElementById(`percent-${item.id}`);
        if (percentCell) percentCell.innerText = `${item.percentage.toFixed(2)}%`;

        const input = document.getElementById(`weight-${item.id}`);
        if (input && document.activeElement !== input) {
            input.value = item.weight.toFixed(2);
        }
    });

    if (totalOilDisplay) totalOilDisplay.innerText = `${actualTotalOil.toFixed(2)} جرام`;
    const solventWeight = totalWeight - actualTotalOil;
    if (solventDisplay) solventDisplay.innerText = `${solventWeight.toFixed(2)} جرام`;

    // Scent Pyramid Calculation
    const distribution = { Top: 0, Heart: 0, Base: 0 };
    currentFormula.forEach(item => {
        if (distribution[item.note_type] !== undefined) {
            distribution[item.note_type] += item.weight;
        }
    });

    const totalOil = actualTotalOil || 1;
    const topPct = (distribution.Top / totalOil) * 100;
    const heartPct = (distribution.Heart / totalOil) * 100;
    const basePct = (distribution.Base / totalOil) * 100;

    const pTop = document.getElementById('pyramid-top');
    const pHeart = document.getElementById('pyramid-heart');
    const pBase = document.getElementById('pyramid-base');
    if (pTop) pTop.style.width = `${topPct}%`;
    if (pHeart) pHeart.style.width = `${heartPct}%`;
    if (pBase) pBase.style.width = `${basePct}%`;

    if (document.getElementById('top-pct')) document.getElementById('top-pct').innerText = topPct.toFixed(0);
    if (document.getElementById('heart-pct')) document.getElementById('heart-pct').innerText = heartPct.toFixed(0);
    if (document.getElementById('base-pct')) document.getElementById('base-pct').innerText = basePct.toFixed(0);

    if (ifraStatus) {
        if (actualTotalOil > (requiredTotalOil + 0.01)) {
            ifraStatus.innerText = 'تنبيه: تجاوز التركيز المحدد';
            ifraStatus.style.color = '#ff4d4d';
        } else {
            ifraStatus.innerText = 'آمن';
            ifraStatus.style.color = '#4cd137';
        }
    }
}

// AI Ratio Suggestion Logic
if (aiSuggestBtn) {
    aiSuggestBtn.addEventListener('click', () => {
        if (currentFormula.length === 0) {
            alert('برجاء إضافة مكونات أولاً!');
            return;
        }

        const totalWeight = parseFloat(perfumeWeightInput.value) || 100;
        const concentrationPct = parseFloat(concentrationInput.value) || 20;
        const targetOilWeight = (concentrationPct / 100) * totalWeight;

        let totalScore = 0;
        currentFormula.forEach(item => {
            let score = 1;
            if (item.note_type === 'Top') score = 2;
            else if (item.note_type === 'Heart') score = 3;
            else score = 4;

            score *= (item.intensity / 5);
            if (item.dominanceLevel === 1) score *= 2;
            else if (item.dominanceLevel === 2) score *= 5;
            else if (item.dominanceLevel === 3) score *= 12;

            if (item.intensity > 8) score *= 0.15;
            item.tempScore = score;
            totalScore += score;
        });

        currentFormula.forEach(item => {
            item.weight = (item.tempScore / totalScore) * targetOilWeight;
        });

        if (aiTips) {
            aiTips.style.display = 'block';
            const dominantItems = currentFormula.filter(i => i.dominanceLevel > 0).map(i => {
                const starStr = '⭐'.repeat(i.dominanceLevel);
                return `${i.name_en} (${starStr})`;
            });
            aiTips.innerHTML = `
                <strong>نصيحة الخبير الذكي:</strong> تم توزيع الأوزان لجعل 
                ${dominantItems.length > 0 ? `<strong>${dominantItems.join('، ')}</strong> هي الروائح الطاغية` : 'العطر متوازناً'} 
                بناءً على خصائص المواد في قاعدة البيانات.
            `;
        }

        renderFormula();
        calculateTotals();
    });
}

// Modal Logic
if (infoBtn && infoModal && closeBtn) {
    infoBtn.onclick = () => infoModal.style.display = "block";
    closeBtn.onclick = () => infoModal.style.display = "none";
    window.onclick = (e) => { if (e.target == infoModal) infoModal.style.display = "none"; };
}

if (searchInput) {
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
}

if (perfumeWeightInput) perfumeWeightInput.addEventListener('input', calculateTotals);
if (concentrationInput) concentrationInput.addEventListener('input', calculateTotals);

document.addEventListener('DOMContentLoaded', async () => {
    // Only run if we are in the plugin container
    if (!document.querySelector('.perfumer-plugin-container')) return;

    allIngredients = await loadIngredients();
    renderIngredients(allIngredients);

    if (totalIngredientsCount) {
        totalIngredientsCount.innerText = `الإجمالي: ${allIngredients.length} مكون`;
    }

    const dateDisplay = document.getElementById('current-date');
    if (dateDisplay) {
        const now = new Date();
        dateDisplay.innerText = now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
});

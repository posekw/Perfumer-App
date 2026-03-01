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
            cas: ing.cas_number || ''
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
    ingredientList.innerHTML = '';
    ingredients.forEach(ing => {
        const div = document.createElement('div');
        div.className = 'ingredient-item';
        const casHtml = ing.cas ? `<span style="font-size:0.7rem; color:var(--text-secondary); margin-right:5px;">CAS: ${ing.cas}</span>` : '';
        div.innerHTML = `
            <div class="ingredient-info">
                <h4>${ing.name_en} <span style="font-size:0.7rem; color:var(--accent-color);">[${ing.note_type}]</span></h4>
                <p style="font-size:0.8rem; color:var(--text-secondary);">${ing.category_ar} - ${ing.description_en} ${casHtml}</p>
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
    formulaBody.innerHTML = '';
    currentFormula.forEach(item => {
        const row = document.createElement('tr');
        const stars = '⭐'.repeat(item.dominanceLevel) || '☆';
        row.innerHTML = `
            <td>${item.name_en}</td>
            <td style="font-size:0.7rem; color:var(--text-secondary); text-align:center;">${item.cas || '-'}</td>
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
    const totalWeight = parseFloat(perfumeWeightInput.value) || 100;
    const concentrationPct = parseFloat(concentrationInput.value) || 20;

    const requiredTotalOil = (concentrationPct / 100) * totalWeight;
    let actualTotalOil = currentFormula.reduce((sum, item) => sum + item.weight, 0);

    currentFormula.forEach(item => {
        item.percentage = actualTotalOil > 0 ? (item.weight / actualTotalOil) * 100 : 0;
        const percentCell = document.getElementById(`percent-${item.id}`);
        if (percentCell) percentCell.innerText = `${item.percentage.toFixed(2)}%`;

        // Sync input value if needed (for UI consistency after AI suggestion)
        const input = document.getElementById(`weight-${item.id}`);
        if (input && document.activeElement !== input) {
            input.value = item.weight.toFixed(2);
        }
    });

    totalOilDisplay.innerText = `${actualTotalOil.toFixed(2)} جرام`;
    const solventWeight = totalWeight - actualTotalOil;
    solventDisplay.innerText = `${solventWeight.toFixed(2)} جرام`;

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

    document.getElementById('pyramid-top').style.width = `${topPct}%`;
    document.getElementById('pyramid-heart').style.width = `${heartPct}%`;
    document.getElementById('pyramid-base').style.width = `${basePct}%`;

    document.getElementById('top-pct').innerText = topPct.toFixed(0);
    document.getElementById('heart-pct').innerText = heartPct.toFixed(0);
    document.getElementById('base-pct').innerText = basePct.toFixed(0);

    if (actualTotalOil > (requiredTotalOil + 0.01)) {
        ifraStatus.innerText = 'تنبيه: تجاوز التركيز المحدد';
        ifraStatus.style.color = '#ff4d4d';
    } else {
        ifraStatus.innerText = 'آمن';
        ifraStatus.style.color = '#4cd137';
    }
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

    // Distribute weights using CSV-defined Note Types and Intensities
    let totalScore = 0;
    currentFormula.forEach(item => {
        let score = 1;

        // 1. Base score by CSV Note Type
        if (item.note_type === 'Top') score = 2;
        else if (item.note_type === 'Heart') score = 3;
        else score = 4; // Base

        // 2. Adjust by CSV Intensity (Programmed by user in Excel)
        score *= (item.intensity / 5);

        // 3. Graduated Dominance multipliers
        if (item.dominanceLevel === 1) score *= 2;
        else if (item.dominanceLevel === 2) score *= 5;
        else if (item.dominanceLevel === 3) score *= 12;

        // 4. Safety throttle for ultra-high intensities (>8)
        if (item.intensity > 8) {
            score *= 0.15;
        }

        item.tempScore = score;
        totalScore += score;
    });

    currentFormula.forEach(item => {
        item.weight = (item.tempScore / totalScore) * targetOilWeight;
    });

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

    renderFormula();
    calculateTotals();
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

// --- Recipe Management Logic ---
const recipeNameInput = document.getElementById('recipe-name');
const saveRecipeBtn = document.getElementById('save-recipe-btn');
const recipesListBtn = document.getElementById('recipes-list-btn');
const recipesModal = document.getElementById('recipes-modal');
const closeRecipesBtn = document.getElementById('close-recipes');
const savedRecipesContainer = document.getElementById('saved-recipes-container');

function saveRecipe() {
    const name = recipeNameInput.value.trim();
    if (!name) {
        alert('برجاء إدخال اسم للوصفة');
        return;
    }
    if (currentFormula.length === 0) {
        alert('لا توجد مكونات لحفظها');
        return;
    }

    const recipes = JSON.parse(localStorage.getItem('perfumer_recipes') || '[]');
    const newRecipe = {
        id: Date.now(),
        name: name,
        date: new Date().toLocaleDateString('ar-EG'),
        totalWeight: perfumeWeightInput.value,
        concentration: concentrationInput.value,
        items: currentFormula.map(i => ({
            id: i.id,
            weight: i.weight,
            dominanceLevel: i.dominanceLevel
        }))
    };

    recipes.push(newRecipe);
    localStorage.setItem('perfumer_recipes', JSON.stringify(recipes));
    recipeNameInput.value = '';
    alert('تم حفظ الوصفة بنجاح! ✅');
}

function renderSavedRecipes() {
    const recipes = JSON.parse(localStorage.getItem('perfumer_recipes') || '[]');
    savedRecipesContainer.innerHTML = '';

    if (recipes.length === 0) {
        savedRecipesContainer.innerHTML = '<p style="text-align:center; color:var(--text-secondary);">لا توجد وصفات محفوظة بعد.</p>';
        return;
    }

    recipes.forEach(recipe => {
        const div = document.createElement('div');
        div.className = 'recipe-item';
        div.innerHTML = `
            <div class="recipe-info">
                <h4>${recipe.name}</h4>
                <p>${recipe.date} • ${recipe.items.length} مكونات</p>
            </div>
            <div class="recipe-actions">
                <button class="load-btn" onclick="loadRecipe(${recipe.id})">تحميل</button>
                <button class="del-btn" onclick="deleteRecipe(${recipe.id})">حذف</button>
            </div>
        `;
        savedRecipesContainer.appendChild(div);
    });
}

window.loadRecipe = (id) => {
    const recipes = JSON.parse(localStorage.getItem('perfumer_recipes') || '[]');
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return;

    if (confirm(`هل تريد تحميل الوصفة "${recipe.name}"؟ سيتم مسح العمل الحالي.`)) {
        perfumeWeightInput.value = recipe.totalWeight;
        concentrationInput.value = recipe.concentration;
        currentFormula = [];

        recipe.items.forEach(itemData => {
            const ing = allIngredients.find(i => i.id === itemData.id);
            if (ing) {
                currentFormula.push({
                    ...ing,
                    weight: itemData.weight,
                    dominanceLevel: itemData.dominanceLevel,
                    percentage: 0
                });
            }
        });

        renderFormula();
        calculateTotals();
        recipesModal.style.display = 'none';
    }
};

window.deleteRecipe = (id) => {
    if (confirm('هل أنت متأكد من حذف هذه الوصفة؟')) {
        let recipes = JSON.parse(localStorage.getItem('perfumer_recipes') || '[]');
        recipes = recipes.filter(r => r.id !== id);
        localStorage.setItem('perfumer_recipes', JSON.stringify(recipes));
        renderSavedRecipes();
    }
};

saveRecipeBtn.addEventListener('click', saveRecipe);
recipesListBtn.addEventListener('click', () => {
    renderSavedRecipes();
    recipesModal.style.display = 'block';
});
closeRecipesBtn.onclick = () => recipesModal.style.display = 'none';

window.addEventListener('click', (e) => {
    if (e.target == recipesModal) recipesModal.style.display = 'none';
});

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

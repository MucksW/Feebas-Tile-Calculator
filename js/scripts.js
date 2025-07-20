// State
let lang = "gb";
let conditions;
let lifestyle;
let hobbies;
let generated = false;

var firstWordList = document.getElementById('firstWord');
var secondWordList = document.getElementById('secondWord');
const canvas = document.getElementById("overlayCanvas");
const context = canvas.getContext("2d");

let unreachable_tiles = [105, 119, 144, 296, 297, 298];

let colorStorage = {};

let addedTrendsCount = 0;
const maxTrends = 4;
updateOtherTrendsBox();

let firstColors = ["#E34234", "#FFD700", "#0BDA51", "#A040A0", "#60A020"];
let numberOfResults = 3;

var customSeed = "";
var customSeedChecked = false;

// Functions
function loadWords(lang){

    switch(lang){
        case 'gb': conditions = conditions_en; lifestyle = lifestyle_en; hobbies = hobbies_en; break;
        case 'jp': conditions = conditions_jp; lifestyle = lifestyle_jp; hobbies = hobbies_jp; break;
        case 'fr': conditions = conditions_fr; lifestyle = lifestyle_fr; hobbies = hobbies_fr; break;
        case 'de': conditions = conditions_de; lifestyle = lifestyle_de; hobbies = hobbies_de; break;
        case 'it': conditions = conditions_it; lifestyle = lifestyle_it; hobbies = hobbies_it; break;
        case 'es': conditions = conditions_es; lifestyle = lifestyle_es; hobbies = hobbies_es; break;
    }

    firstWordList.innerHTML = '';
    secondWordList.innerHTML = '';

    $(".fw").each(function() {
        $(this).val(conditions[0]);
    });
    $(".sw").each(function() {
        $(this).val(lifestyle[0]);
    });
    

    conditions.forEach(function(item){
       var option = document.createElement('option');
       option.value = item;
       firstWordList.appendChild(option);
    });

    lifestyle.concat(hobbies).forEach(function(item){
       var option = document.createElement('option');
       option.value = item;
       secondWordList.appendChild(option);
    });

    validateInput();

}

loadWords(lang);

// Change color of generated tiles and update in storage
$('.resultTable tbody').on('change', '.colorPicker', function() {
    
    const changedPicker = $(this);
    const newColor = changedPicker.val();

    const colorSquare = changedPicker.parent('div');
    colorSquare.css('background', newColor);
    
    const resultKey = changedPicker.closest('.square').attr("id")[0];

    colorStorage[resultKey] = newColor;

    calculate_if_generated();
    
});

// LCRNG algorithm
function next(seed, n = 1, feebas = false){
    let rng = BigInt(seed);
    let mult = BigInt(1103515245);
    let add = feebas ? BigInt(12345) : BigInt(24691);

    for (let i = 0; i < n; i++) {
        rng = BigInt(mult * rng + add) & BigInt(0xFFFFFFFF);
    }
    return rng;
}

/*  Advances the PRNG state until after the Trainer ID was generated to prevent false
    positives because the Dewford trend is only generated shortly after the Trainer ID */
function advanceToTID(seed, tid){
    seed = BigInt(seed);
    while(seed >> BigInt(16) != tid){
        seed = next(seed);
    }
    return seed;
}

/*  Advances the PRNG state until after the minimum possible amount of advances after the dialogue
    with Professor Birch to prevent false positives because the Dewford trend is generated during 
    the shrinking animation just before teleporting inside the truck */
function skipImpossibleAdvances(seed){
    seed = BigInt(seed);
    for(var i = 0; i < 700; i++){
        seed = next(seed);
    }
    return seed;
}

function getPhraseArrayFromWords(word1, word2){
    var first_word_index = conditions.indexOf(word1);     // The first word is always from the group conditions

    var second_word_from_group_lifestyle = 0; // The second word can be either from lifestyle or hobbies

    if(lifestyle.includes(word2)){
        second_word_from_group_lifestyle = 1;
        var second_word_index = lifestyle.indexOf(word2);
    }
    else{
        var second_word_index = hobbies.indexOf(word2);
    }

    return [first_word_index, second_word_from_group_lifestyle, second_word_index];
}

/*  Search for the first appearence of the combination of both words of the Dewford trend and return the
    16Bit High value 7 advances after that which is usually the Feebas Random Value. Due to the varying
    vblank interval, sometimes the Feebas Random Value is generated 6 or 8 advances after the first word
    of the Dewford trend. These are proposed as alternative values  */
function getFeebasRands(seed, word1, word2, is_emerald, tid){

    var phraseArray = getPhraseArrayFromWords(word1, word2);

    var first_word_index = phraseArray[0];
    var second_word_from_group_lifestyle = phraseArray[1];
    var second_word_index = phraseArray[2];

    seed = is_emerald ? skipImpossibleAdvances(seed) : advanceToTID(seed, tid);

    let feebasRands = [];

    let numResults = is_emerald ? 5 : 3;

    while(feebasRands.length < numResults){ // Loop that finds three consecutive RNG calls that match the given words
        seed = next(seed);
        if((seed >> BigInt(16)) % BigInt(69) == first_word_index){ // Found match for first word index
          
            if(((next(seed) >> BigInt(16)) & BigInt(1)) == second_word_from_group_lifestyle){ // Found match for group of second word
                var elements_in_second_group = second_word_from_group_lifestyle ? 45 : 54;

                if((next(seed,2) >> BigInt(16)) % BigInt(elements_in_second_group) == second_word_index){ // Found match for second word index

                    var numAdvances; // Additional Advances for trendiness values
                    if((next(seed,4) >> BigInt(16)) % BigInt(98) > 50){

                        if((next(seed,5) >> BigInt(16)) % BigInt(98) > 80){
                            numAdvances = 8;
                        }
                        else{
                            numAdvances = 7;
                        }
                    }
                    else{
                        numAdvances = 6;
                    }
                    
                    feebasRands.push(next(seed,numAdvances) >> BigInt(16));
                }
            }
        }
    }

    return feebasRands;
}


/*  Calculate the Feebas Tiles based on the Feebas Random Value.
    Tile 0 gets reassigned to tile 447 and tiles 1 to 3 are ignored */
function getFeebasTiles(seed){

    let tiles_list = [];
    let tiles_found = 0;

    while(tiles_found < 6){
      seed = next(seed, 1, feebas = true);
      tile = (seed >> BigInt(16)) % BigInt(0x1bf);

      if(tile == 0) tile = 447;

      if(tile < 4) continue;

      if(unreachable_tiles.includes(Number(tile))){
          tiles_found += 1;
          continue;
      }

      tiles_list.push(Number(tile));
      tiles_found += 1;
    }
    return tiles_list;
}

/*  Return the Feebas random value based on a given Dewford
    Trend and the RNG state when the TID was generated */
function getFeebasRandFromSeedAndPhrase(seed, word1, word2, step = 2){
    
    let phrase = getPhraseArrayFromWords(word1, word2);
    let first_word_index = phrase[0];
    let second_word_from_group_lifestyle = phrase[1];
    let second_word_index = phrase[2];

    seed = next(seed, step);
    
    for( let i = 0; i < 5; i++ ){
        seed = next(seed);
        
        var numAdvances; // Additional Advances for trendiness values
        if((next(seed,4) >> BigInt(16)) % BigInt(98) > 50){

            if((next(seed,5) >> BigInt(16)) % BigInt(98) > 80){
                numAdvances = 8;
            }
            else{
                numAdvances = 7;
            }
        }
        else{
            numAdvances = 6;
        }

        if((seed >> BigInt(16)) % BigInt(69) == first_word_index){ // Found match for first word index
          
            if(((next(seed) >> BigInt(16)) & BigInt(1)) == second_word_from_group_lifestyle){ // Found match for group of second word
                var elements_in_second_group = second_word_from_group_lifestyle ? 45 : 54;

                if((next(seed,2) >> BigInt(16)) % BigInt(elements_in_second_group) == second_word_index){ // Found match for second word index
                    return next(seed,numAdvances) >> BigInt(16);
                }
            }
        }

        seed = next(seed, numAdvances);
                
    }

    return -1;
}

/*  Simulate what Dewford trends are created for a given TID seed
    and return true if it contains the given phrase */
function checkIfSeedCreatesPhrase(seed, phrase, step){
    
    seed = next(seed, step);
    let bigIntPhrase = [BigInt(phrase[0]), BigInt(phrase[1]), BigInt(phrase[2])];

    for( let i = 0; i < 5; i++ ){
        let word1 = (next(seed) >> BigInt(16)) % BigInt(69);
        let check = (next(seed, 2) >> BigInt(16)) & BigInt(1);
        let word2 = -1;
        
        if(check) word2 = (next(seed, 3) >> BigInt(16)) % BigInt(45);
        else{
            word2 = (next(seed, 3) >> BigInt(16)) % BigInt(54);
        }

        let numAdvances = 0;
        if(((next(seed, 5) >> BigInt(16)) % BigInt(98)) > BigInt(50)){
            if(((next(seed, 6) >> BigInt(16)) % BigInt(98)) > BigInt(80)) numAdvances = 9;
            else{
                numAdvances = 8;
            }
        }
        else{
            numAdvances = 7;
        }
            
        let checkPhrase = [word1, check, word2];
        if(bigIntPhrase.every((val, index) => val === checkPhrase[index])){
            return true;
        }
        seed = next(seed, numAdvances);
    }
        
    return false;
}

// Returns all RNG States where the phrase appears in the correct order and distance after the TID
function getSeedsFromPhraseAndTID(tid, word1, word2){

    let phrase = getPhraseArrayFromWords(word1, word2);

    let first_word_index = phrase[0];
    let second_word_from_group_lifestyle = phrase[1];
    let second_word_index = phrase[2];
    let seedLists = [];
    let seedListStep2 = [];
    let seedListStep3 = [];
    let seed;
  
    for(let i = 0; i < 0x10000; i++){
        seed = BigInt(BigInt(tid) << BigInt(16)) + BigInt(i);
        if (checkIfSeedCreatesPhrase(seed, phrase, 2)) seedListStep2.push(seed);
        if (checkIfSeedCreatesPhrase(seed, phrase, 3)) seedListStep3.push(seed);
    }
    seedLists.push(seedListStep2);
    seedLists.push(seedListStep3);
    return seedLists;
}

// Returns all RNG States where the phrase appears in the correct order and distance after the given TID Seed
function getMatchingSeedsFromPhraseAndSeed(tidseeds, word1, word2, step){

    let phrase = getPhraseArrayFromWords(word1, word2);

    let first_word_index = phrase[0];
    let second_word_from_group_lifestyle = phrase[1];
    let second_word_index = phrase[2];
    let seedList = [];
    let seed;

    tidseeds.forEach(function(seed){
       if (checkIfSeedCreatesPhrase(seed, phrase, step)) seedList.push(seed);
    });

    return seedList;
}

// Color all the given tiles with the provided color
function colorTiles(tilesList, color){

    context.fillStyle = color;

    tilesList.forEach((element) => {
        let tileCoords = tileCoordinates[element];
        if(tileCoords[0] == 369 && tileCoords[1] == 465){
            context.fillRect(257, 257, 79, 31);
            return;
        }
        context.fillRect(tileCoords[0], tileCoords[1], 15, 15);
    });

}

function drawResults(){
    context.clearRect(0, 0, canvas.width, canvas.height);

    for (const resultKey in colorStorage) {

        const color = colorStorage[resultKey];
        const isInput = $(`#${resultKey} input`).length;
        const value = isInput
        ? $(`#${resultKey} input`).val()
        : $(`#${resultKey}`).text();

        if ($(`#checkboxresult${resultKey}`).is(':checked') && (!isInput || $('#customSeed')[0].validity.valid)) {
            colorTiles(getFeebasTiles(parseInt("0x" + value, 16)), color);
        }
    }
}

function resetResultTable(){
    customSeed = $('#customSeed')[0].value;
    customSeedChecked = $('.customBox').is(':checked');
    $('.resultTable tbody').empty();
    colorStorage = {};
    numberOfResults = 0;
}

// Validate input of all trend input boxes
function validateInput() {

    var valid = true;

    var tid = document.getElementById("trainerID").value;

    if(tid < 0 || tid > 65535){
        valid = false;
    }

    $(".fw").each(function() {
        var firstWord = $(this).val().toUpperCase();
        if (!conditions.includes(firstWord)) {
            $(this)[0].setCustomValidity("invalid");
            valid = false;
            $('#calcButton').prop('disabled', true);
            return valid;
        }
        else{
            $(this)[0].setCustomValidity("");
            $('#calcButton').prop('disabled', false);
        }
    });

    $(".sw").each(function() {
        var secondWord = $(this).val().toUpperCase();
        if(!lifestyle.concat(hobbies).includes(secondWord)){
            $(this)[0].setCustomValidity("invalid");
            valid = false;
            $('#calcButton').prop('disabled', true);
        }
        else{
            $(this)[0].setCustomValidity("");
            if(valid){
                $('#calcButton').prop('disabled', false);
            }
        }
    });
    
    return valid;

}

function validateCustomSeed() {
    const value = $("#customSeed").val()
    const regEx = /^[-+]?[0-9A-Fa-f]+$/;
    const isHex = regEx.test(value);

    if (isHex) {
        $('#customSeed')[0].setCustomValidity("");
    } else {
        $('#customSeed')[0].setCustomValidity("invalid.");
    }

}

function createRandomColor(){
    return '#'+(Math.random()*0xFFFFFF<<0).toString(16).padStart(6, "0");
}

function calculate() {

    if(!validateInput()){
        return;
    }

    const context = canvas.getContext('2d');

    context.clearRect(0, 0, canvas.width, canvas.height);
    resetResultTable();

    var is_emerald = $(gameOption)[0].value == 'Emerald';

    var tid = $('#trainerID')[0].value;
    var seed = is_emerald ? tid : 0x5a0;
    var word1 = $('#firstWordInput')[0].value.toUpperCase();
    var word2 = $('#secondWordInput')[0].value.toUpperCase();

    feeb_rands = getFeebasRands(seed, word1, word2, is_emerald, tid);

    var tiles = [getFeebasTiles(feeb_rands[0]),
                 getFeebasTiles(feeb_rands[1]),
                 getFeebasTiles(feeb_rands[2])];

    feeb_rands.forEach(function(result){
        addResult(result.toString(16).toUpperCase().padStart(4, "0"), createRandomColor());
    });

    addCustomResult();
    drawResults();

    generated = true;
}

function calculateLiveBattery(){

    if(!validateInput()){
        return;
    }

    let firstWords = $(".additionalfirstphrases").map(function() {
        return $(this).val();
    }).get();

    let secondWords = $(".additionalsecondphrases").map(function() {
        return $(this).val();
    }).get();

    let phrasePairs = firstWords.map((first, index) => [first, secondWords[index]]);

    var tid = $('#trainerID')[0].value;
    var word1 = $('#firstWordInput')[0].value.toUpperCase();
    var word2 = $('#secondWordInput')[0].value.toUpperCase();

    // get seeds that create the phrase with 2 and 3 RNG calls in between TID and Dewford Trend generation
    let seedLists = getSeedsFromPhraseAndTID(tid, word1, word2);
    let seedsStep2 = seedLists[0];
    let seedsStep3 = seedLists[1];

    let finalResults = [];

    if(phrasePairs.length < 1){
        seedsStep2.forEach(function(seed){
            finalResults.push(getFeebasRandFromSeedAndPhrase(seed, word1, word2, 2).toString(16).toUpperCase().padStart(4, "0"));
        });
        seedsStep3.forEach(function(seed){
            finalResults.push(getFeebasRandFromSeedAndPhrase(seed, word1, word2, 3).toString(16).toUpperCase().padStart(4, "0"));
        });
    }

    // get all seeds that also create the other Dewford Trends
    phrasePairs.forEach(function(phrase){
        seedsStep2 = getMatchingSeedsFromPhraseAndSeed(seedsStep2, phrase[0], phrase[1], 2);
        seedsStep3 = getMatchingSeedsFromPhraseAndSeed(seedsStep3, phrase[0], phrase[1], 3);
    });

    seedsStep2.forEach(seed => {
        finalResults.push(getFeebasRandFromSeedAndPhrase(seed, word1, word2, 2).toString(16).toUpperCase().padStart(4, "0"));
    });
    seedsStep3.forEach(seed => {
        finalResults.push(getFeebasRandFromSeedAndPhrase(seed, word1, word2, 3).toString(16).toUpperCase().padStart(4, "0"));
    });

    // Eliminate duplicates
    let uniqueResults = [...new Set(finalResults)];

    resetResultTable();
    
    uniqueResults.forEach(function(result){
        addResult(result, createRandomColor());
    });

    addCustomResult();
    drawResults();

    generated = true;
}

function calculateButton(){
    var is_emerald = $(gameOption)[0].value == 'Emerald';

    if(is_emerald){
        calculate();
    }
    else if($("#batteryCheckbox").prop("checked")){
        calculateLiveBattery();
    }
    else{
        calculate();
    }
}

function calculate_if_generated(){
    if(generated){
        drawResults();
    }
}

window.onscroll = function () {
    toggleGoToTopButton();
};

function toggleGoToTopButton() {
    const goToTopBtn = document.getElementById('goToTopBtn');
    if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
        goToTopBtn.style.display = 'block';
    } else {
        goToTopBtn.style.display = 'none';
    }
}

function goToTop() {
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
}

// Flag Button
$(".dropdown-item").on("click",(function(){
    var lang = $(this).attr('id');
    $("#defaultIcon").removeClass($("#defaultIcon").attr('class'));
    $("#defaultIcon").addClass("flag-icon flag-icon-" + lang);
    loadWords(lang);
}));

/*  Disable the live battery functions if irrelevant and disable the
    add and remove trend buttons if there is nothing to add or remove */
function updateOtherTrendsBox() {
    let batteryIsIrrelevant = !$('#batteryCheckbox').is(':checked') || $(gameOption)[0].value == 'Emerald';

    let disableRemovePhraseBtnState = addedTrendsCount === 0 || batteryIsIrrelevant;
    let disableAddPhraseBtnState = addedTrendsCount >= maxTrends || batteryIsIrrelevant;

    batteryIsIrrelevant ? $('#otherTrends').addClass('disabled') : $('#otherTrends').removeClass('disabled');

    $('#removePhraseBtn').prop('disabled', disableRemovePhraseBtnState);
    $('#addPhraseBtn').prop('disabled', disableAddPhraseBtnState);

}

function addPhrase() {

    addedTrendsCount++;

    var newRectangle = `
        <tr class="addedPhrase">
            <th>First Word ${addedTrendsCount + 1}</th>
            <td><input class="fw selection additionalfirstphrases" list="firstWord" onfocus="this.value='';validateInput()" onchange="this.blur();" onkeyup="validateInput()" value="${conditions[0]}">
                <datalist id="firstWord"></datalist>
            </td>
        </tr>
        <tr class="addedPhrase">
            <th>Second Word ${addedTrendsCount + 1}</th>
            <td><input class="sw selection additionalsecondphrases" list="secondWord" onfocus="this.value='';validateInput()" onchange="this.blur();" onkeyup="validateInput()" value="${lifestyle[0]}">
                <datalist id="secondWord"></datalist>
            </td>
        </tr>
    `;

    $('#otherTrends').append(newRectangle);
    updateOtherTrendsBox();

}

function removePhrase() {

    $('.addedPhrase').slice(-2).remove();

    addedTrendsCount--;
    updateOtherTrendsBox();

}

function addResult(feebasRand, color) {

    if(numberOfResults < 5){
        color = firstColors[numberOfResults];
    }
    
    const newIdKey = `result${numberOfResults}`;
    
    const newResult = `
        <tr>
            <th><input type="checkbox" id="checkbox${newIdKey}" checked onclick="calculate_if_generated()"></th>
            <th width="75%">Feebas Random Value ${numberOfResults + 1}</th>
            <th>
                <div class="square" id="${numberOfResults}_square" style="background-color: ${color};">
                    <input type="color" class="colorPicker" value="${color}">
                </div>
            </th>
            <td id="${numberOfResults}">${feebasRand}</td>
        </tr>
    `;

    $('.resultTable tbody').append(newResult);

    colorStorage[numberOfResults] = color;
    numberOfResults++;
}

function addCustomResult(){
    const newIdKey = `result${numberOfResults}`;

    const checkedAttr = customSeedChecked ? "checked" : "";

    const customResult = `
        <tr>
            <th><input class="customBox" type="checkbox" id="checkbox${newIdKey}" onclick="calculate_if_generated()" ${checkedAttr}></th>
            <th>Custom Feebas Value</div></th>
            <th><div class="square" id="${numberOfResults}_square" style="background-color: #FFFFFF;"><input type="color" class="colorPicker" value="#FFFFFF" id="colorPicker3"/></div></th>
            <td id="${numberOfResults}"><input type="text" id="customSeed" name="customSeed" placeholder="FFFF" onkeyup="validateCustomSeed();calculate_if_generated()" maxlength="4" value="${customSeed}"></th>
        </tr>
    `;

    $('.resultTable tbody').append(customResult);

    colorStorage[numberOfResults] = "#FFFFFF";
    numberOfResults++;
}

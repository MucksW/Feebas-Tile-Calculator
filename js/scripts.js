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

let color0 = "#E34234";
let color1 = "#FFD700";
let color2 = "#0BDA51";


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

    document.getElementById("firstWordInput").value = conditions[0];
    document.getElementById("secondWordInput").value = lifestyle[0];

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

$('#colorPicker0').on('change', function (e) {
    var optionSelected = $("option:selected", this);
    var valueSelected = this.value;
    $("#square0").css("background", valueSelected);

    color0 = valueSelected;
    calculate_if_generated();

});

$('#colorPicker1').on('change', function (e) {
    var optionSelected = $("option:selected", this);
    var valueSelected = this.value;
    $("#square1").css("background", valueSelected);

    color1 = valueSelected;
    calculate_if_generated();

});

$('#colorPicker2').on('change', function (e) {
    var optionSelected = $("option:selected", this);
    var valueSelected = this.value;
    $("#square2").css("background", valueSelected);

    color2 = valueSelected;
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

/*  Search for the first appearence of the combination of both words of the Dewford trend and return the
    16Bit High value 7 advances after that which is usually the Feebas Random Value. Due to the varying
    vblank interval, sometimes the Feebas Random Value is generated 6 or 8 advances after the first word
    of the Dewford trend. These are proposed as alternative values  */
function getFeebasRands(seed, word1, word2, is_emerald, tid){

    var first_word_index = conditions.indexOf(word1);     // The first word is always from the group conditions

    var second_word_from_group_lifestyle = 0; // The second word can be either from lifestyle or hobbies

    if(lifestyle.includes(word2)){
        second_word_from_group_lifestyle = 1;
        var second_word_index = lifestyle.indexOf(word2);
    }
    else{
        var second_word_index = hobbies.indexOf(word2);
    }

    seed = is_emerald ? skipImpossibleAdvances(seed) : advanceToTID(seed, tid);

    feebasRands = [];

    while(feebasRands.length < 3){ // Loop that finds three consecutive RNG calls that match the given words
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

    tiles_list = [];
    tiles_found = 0;

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

function colorPixels(tileCoords, color) {
    context.fillStyle = color;
    if(tileCoords[0] == 369 && tileCoords[1] == 465){
        context.fillRect(257, 257, 79, 31);
        return;
    }
    context.fillRect(tileCoords[0], tileCoords[1], 15, 15);
}

function colorPixelsSplitTwo(tileCoords, color0, color1) {
    if(tileCoords[0] == 369 && tileCoords[1] == 465){
        context.fillStyle = "black";
        context.fillRect(257, 257, 79, 31);
        for(var i = 0; i < 5; i++){
            var x = 257 + 16*i;
            context.fillStyle = color0;
            context.fillRect(x, 257, 7, 31);
            context.fillStyle = color1;
            context.fillRect(x+8, 257, 7, 31);
        }
        context.fillStyle = "black";
        context.fillRect(257, 272, 79, 1);
        return;
    }
    context.fillStyle = color0;
    context.fillRect(tileCoords[0], tileCoords[1], 7, 15);
    context.fillStyle = "black";
    context.fillRect(tileCoords[0]+7, tileCoords[1], 1, 15);
    context.fillStyle = color1;
    context.fillRect(tileCoords[0]+8, tileCoords[1], 7, 15);
}

function colorPixelsSplitThree(tileCoords, color0, color1, color2) {
    var bridgeCoords = 257
    if(tileCoords[0] == 369 && tileCoords[1] == 465){
        context.fillStyle = "black";
        context.fillRect(bridgeCoords, bridgeCoords, 79, 31);
        context.fillStyle = color0;
        context.fillRect(bridgeCoords, bridgeCoords, 79, 4);

        for(var i = 0; i < 5; i++){
            context.fillRect(5+bridgeCoords+5*i, 4+bridgeCoords+2*i, 69-(10*i), 2);
        }

        context.fillStyle = color1;
        context.fillRect(bridgeCoords, bridgeCoords+16, 38, 15);

        for(var i = 0; i < 5; i++){
            context.fillRect(bridgeCoords, 6+bridgeCoords+2*i, 5+5*i, 2);
        }

        context.fillStyle = color2;
        context.fillRect(bridgeCoords+41, bridgeCoords+16, 38, 15);

        for(var i = 0; i < 5; i++){
            context.fillRect(bridgeCoords+74-5*i, 6+bridgeCoords+2*i, 5+5*i, 2);
        }
        return;
    }

    context.fillStyle = "black";
    context.fillRect(tileCoords[0], tileCoords[1], 15, 15);
    context.fillStyle = color0;
    context.fillRect(tileCoords[0], tileCoords[1], 15, 2);

    for(var i = 0; i < 5; i++){
        context.fillRect(1+tileCoords[0]+i, 2+tileCoords[1]+i, 13-(2*i), 1);
    }

    context.fillStyle = color1;
    context.fillRect(tileCoords[0], tileCoords[1]+8, 7, 7);

    for(var i = 0; i < 5; i++){
        context.fillRect(tileCoords[0], 3+tileCoords[1]+i, 1+i, 1);
    }

    context.fillStyle = color2;
    context.fillRect(tileCoords[0]+8, tileCoords[1]+8, 7, 7);

    for(var i = 0; i < 5; i++){
        context.fillRect(tileCoords[0]+14-i, 3+tileCoords[1]+i, 1+i, 1);
    }

}

function colorTiles(tilesList, color0, color1, color2, overlaps){
    const canvas = document.getElementById("overlayCanvas");
    const context = canvas.getContext("2d");
    switch(Number(overlaps)){
        case 0:
            tilesList.forEach((element) => colorPixels(tileCoordinates[element], color0));
            break;
        case 1:
            tilesList.forEach((element) => colorPixelsSplitTwo(tileCoordinates[element], color0, color1));
            break;
        case 2:
            tilesList.forEach((element) => colorPixelsSplitThree(tileCoordinates[element], color0, color1, color2));
            break;
    }
}

function validateInput() {
    var firstWord = document.getElementById("firstWordInput").value.toUpperCase();
    var secondWord = document.getElementById("secondWordInput").value.toUpperCase();
    var tid = document.getElementById("trainerID").value;

    var valid = true;

    if(tid < 0 || tid > 65535){
        valid = false;
    }

    if (!conditions.includes(firstWord)) {
        document.getElementById("firstWordInput").setCustomValidity("invalid");
        valid = false;
    }
    else{
        document.getElementById("firstWordInput").setCustomValidity("");
    }

    if(!lifestyle.concat(hobbies).includes(secondWord)){
        document.getElementById("secondWordInput").setCustomValidity("invalid");
        valid = false;
    }
    else{
        document.getElementById("secondWordInput").setCustomValidity("");
    }

    return valid;

}

function calculate() {

    if(!validateInput()){
        return;
    }

    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    var is_emerald = document.getElementById("gameOption").value;

    is_emerald = (is_emerald == 'Emerald') ? 1 : 0;

    var tid = document.getElementById("trainerID").value;
    var seed = is_emerald ? tid : 0x5a0;
    var word1 = document.getElementById("firstWordInput").value.toUpperCase();
    var word2 = document.getElementById("secondWordInput").value.toUpperCase();

    var showResult0 = +document.getElementById("result0Checkbox").checked;
    var showResult1 = +document.getElementById("result1Checkbox").checked;
    var showResult2 = +document.getElementById("result2Checkbox").checked;

    feeb_rands = getFeebasRands(seed, word1, word2, is_emerald, tid);

    var tiles = [ getFeebasTiles(feeb_rands[0]),
                getFeebasTiles(feeb_rands[1]),
                getFeebasTiles(feeb_rands[2])];

    overlap01 = [];
    overlap12 = [];
    overlap02 = [];
    overlap012 = [];

    tiles[0].forEach((element) => tiles[1].includes(element) ? overlap01.push(element) : null);
    tiles[1].forEach((element) => tiles[2].includes(element) ? overlap12.push(element) : null);
    tiles[0].forEach((element) => tiles[2].includes(element) ? overlap02.push(element) : null);
    overlap01.forEach((element) => overlap12.includes(element) ? overlap012.push(element) : null);

    if(showResult0) colorTiles(tiles[0], color0, null, null, 0);
    if(showResult1) colorTiles(tiles[1], color1, null, null, 0);
    if(showResult2) colorTiles(tiles[2], color2, null, null, 0);
    if(showResult0 && showResult1) colorTiles(overlap01, color0, color1, null, 1);
    if(showResult1 && showResult2) colorTiles(overlap12, color1, color2, null, 1);
    if(showResult0 && showResult2) colorTiles(overlap02, color0, color2, null, 1);
    if(showResult0 && showResult1 && showResult2) colorTiles(overlap012, color0, color1, color2, 2);

    document.getElementById("result0").innerHTML = feeb_rands[0].toString(16).toUpperCase();
    document.getElementById("result1").innerHTML = feeb_rands[1].toString(16).toUpperCase();
    document.getElementById("result2").innerHTML = feeb_rands[2].toString(16).toUpperCase();

    generated = true;
}

function calculate_if_generated(){
    if(generated){
        calculate();
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

$(".dropdown-item").on("click",(function(){
    var lang = $(this).attr('id');
    $("#defaultIcon").removeClass($("#defaultIcon").attr('class'));
    $("#defaultIcon").addClass("flag-icon flag-icon-" + lang);
    loadWords(lang);
}));
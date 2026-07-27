

// Composite language identity: the ISO 639-3 code, except when it is a
// non-distinguishing placeholder ('mis' uncoded / 'und') in which case the
// Glottocode is used. This keeps the 28 'mis'-coded languages distinct instead
// of collapsing them under one ISO. For every ISO-coded language langKey===iso,
// so demographic (population) logic is unaffected.
function langKey(l){const i=l&&l.iso;if(i&&i!=='mis'&&i!=='und')return i;const g=l&&l.glottocode;return g?'g:'+g:'n:'+((l&&l.name)||'');}
function isDemographic(l){return !!(l&&l.iso&&SPEAKER_ESTIMATES[l.iso]);}
// Short code shown next to a language: the ISO 639-3 code, or the Glottocode for
// uncoded ('mis'/'und') languages so they stay distinguishable.
function languageCodeLabel(l){const i=l&&l.iso;return (i&&i!=='mis'&&i!=='und')?i.toUpperCase():(l&&l.glottocode?l.glottocode:'—');}

const DEMOGRAPHIC_ISO=new Set();
const ATTESTED_KEYS=new Set();
for(const d of Object.values(DATA)){
  for(const x of d.languages){
    ATTESTED_KEYS.add(langKey(x));
    if(x.iso&&SPEAKER_ESTIMATES[x.iso]) DEMOGRAPHIC_ISO.add(x.iso);
  }
}
const DEMOGRAPHIC_LANGUAGE_COUNT=DEMOGRAPHIC_ISO.size;
const ATTESTED_LANGUAGE_COUNT=ATTESTED_KEYS.size;
const SPEAKER_BASE=[...DEMOGRAPHIC_ISO].reduce((sum,iso)=>sum+SPEAKER_ESTIMATES[iso],0);
// All source-attested languages for a symbol, deduplicated by composite key.
// Drives L, the picker and the drawer list. NO demographic filter.
function attestedLanguages(d,symbol=''){
  const byKey=new Map();
  for(const x of d.languages){
    const k=langKey(x);
    const previous=byKey.get(k);
    if(!previous){byKey.set(k,{...x,clickSegments:x.clickSegments?[...x.clickSegments]:undefined});continue;}
    if(x.clickSegments){previous.clickSegments=[...new Set([...(previous.clickSegments||[]),...x.clickSegments])].sort();}
    if(symbol&&typeof graphemeFor==='function'&&!graphemeFor(previous,symbol)&&graphemeFor(x,symbol)){const merged={...x};if(previous.clickSegments)merged.clickSegments=[...previous.clickSegments];byKey.set(k,merged);}
  }
  return [...byKey.values()].sort((a,b)=>(SPEAKER_ESTIMATES[b.iso]||0)-(SPEAKER_ESTIMATES[a.iso]||0)||a.name.localeCompare(b.name));
}
// Demographic-certain subset only — the P (population) universe. Attested-only
// languages carry no speaker estimate and are absent here (not counted as zero).
function coveredLanguages(d,symbol=''){return attestedLanguages(d,symbol).filter(isDemographic);}
function mappingStateForPopulation(lang,symbol){
  if(!symbol||typeof languageSymbolState!=='function')return {state:'attested'};
  const inventory=LANGUAGE_SYMBOLS.get(langKey(lang))||new Set();
  return languageSymbolState(lang,symbol,inventory);
}
function populationEligible(lang,symbol){
  const state=mappingStateForPopulation(lang,symbol).state;
  return state==='mapped'||state==='variant';
}
function speakerStats(d,symbol=''){
  d=d||{languages:[]};
  const languages=attestedLanguages(d,symbol);
  const demographic=languages.filter(isDemographic);
  const populationLanguages=symbol?demographic.filter(x=>populationEligible(x,symbol)):demographic;
  const total=populationLanguages.reduce((sum,x)=>sum+SPEAKER_ESTIMATES[x.iso],0);
  const doculectCount=d.languages.length;
  return {total,languageCount:languages.length,demographicCount:demographic.length,populationLanguageCount:populationLanguages.length,doculectCount,languages,populationLanguages,pct:SPEAKER_BASE?total/SPEAKER_BASE*100:0,languagePct:ATTESTED_LANGUAGE_COUNT?languages.length/ATTESTED_LANGUAGE_COUNT*100:0};
}
function formatPeople(n){
  if(!n)return '0';
  if(n>=1e9)return (n/1e9).toLocaleString('en-US',{maximumFractionDigits:2})+'B';
  if(n>=1e6)return (n/1e6).toLocaleString('en-US',{maximumFractionDigits:n>=100e6?0:1})+'M';
  if(n>=1e3)return (n/1e3).toLocaleString('en-US',{maximumFractionDigits:1})+'K';
  return n.toLocaleString('en-US');
}
function populationForLanguage(lang){return lang.iso&&SPEAKER_ESTIMATES[lang.iso]?SPEAKER_ESTIMATES[lang.iso]:0;}
const drawer=document.getElementById('drawer'), list=document.getElementById('langList'), lsearch=document.getElementById('langSearch'); let current=[], currentSymbol='';







for(const [iso,map] of Object.entries(VERIFIED_ORTHO)){const key='verified-'+iso;ORTHO[key]=map;ORTHO_BY_ISO[iso]=key;}

function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function allGraphemesForPhoneme(lang,phoneme){return [...new Set(graphemesForPhoneme(lang,phoneme))];}
function chartHasStandaloneSymbol(symbol){return !!document.querySelector(`.sym[data-symbol="${CSS.escape(symbol)}"]`);}
function genericCoverageRows(lang){
  const reverse=reverseGraphemeMappings(lang);
  return [...reverse.entries()].map(([grapheme,phonemeSet])=>{
    const phonemes=[...phonemeSet].sort((a,b)=>a.localeCompare(b,'en'));
    const alternativeSpellings=phonemes.filter(p=>allGraphemesForPhoneme(lang,p).length>1);
    const relationships=[];
    if(phonemes.length>1)relationships.push(`one spelling → ${phonemes.length} phonemes`);
    if(alternativeSpellings.length)relationships.push(`${alternativeSpellings.length} phoneme${alternativeSpellings.length===1?' has':'s have'} other spellings`);
    if(!relationships.length)relationships.push('one-to-one in this curated profile');
    const coverageCount=phonemes.filter(chartHasStandaloneSymbol).length;
    const chartCoverage=coverageCount===phonemes.length?'standalone':coverageCount?'partial':'composite';
    const note=phonemes.length>1?'Pronunciation depends on context, word origin, position, dialect, or orthographic convention.':alternativeSpellings.length?'The same phoneme also has other spellings in this profile.':'Curated phoneme–grapheme association.';
    return {grapheme,name:'',phonemes,className:'',relationship:relationships.join(' · '),chartCoverage,note};
  }).sort((a,b)=>a.grapheme.localeCompare(b.grapheme,lang.iso==='jpn'||lang.iso==='kor'?'ja':'en'));
}
function profileForLanguage(lang){return lang&&lang.iso?VERIFIED_LANGUAGE_PROFILES[lang.iso]||null:null;}
function coverageRowsForLanguage(lang){
  const profile=profileForLanguage(lang);
  if(!profile)return [];
  return profile.rows.map(row=>{
    const phonemes=row.phonemes||[];
    const coverageCount=phonemes.filter(chartHasStandaloneSymbol).length;
    const chartCoverage=!phonemes.length?'none':coverageCount===phonemes.length?'standalone':coverageCount?'partial':'composite';
    const alternativeSpellings=phonemes.filter(p=>allGraphemesForPhoneme(lang,p).length>1);
    const relationships=[];
    if(!phonemes.length)relationships.push('orthographic function; no independent phoneme');
    else if(phonemes.length>1)relationships.push(`one grapheme → ${phonemes.length} phonemes/values`);
    else relationships.push('one grapheme → one listed phoneme/value');
    if(alternativeSpellings.length)relationships.push(`${alternativeSpellings.length} listed value${alternativeSpellings.length===1?' has':'s have'} other spellings`);
    return {...row,relationship:relationships.join(' · '),chartCoverage};
  });
}
function verificationLabel(status){
  return ({'verified-complete':'Verified complete alphabet','verified-complete-basic':'Verified basic inventory','verified-contextual':'Verified, context-sensitive','verified-partial':'Verified partial profile','verified-romanization':'Verified romanization profile','verified-complete-modern':'Verified complete modern inventory'})[status]||status;
}
function renderOrthographyCoverage(lang){
  const section=document.getElementById('orthographyCoverage');
  const profile=profileForLanguage(lang);
  if(!profile){section.hidden=true;return;}
  const rows=coverageRowsForLanguage(lang);
  if(!rows.length){section.hidden=true;return;}
  const uniquePhonemes=new Set(rows.flatMap(row=>row.phonemes||[]).filter(Boolean));
  const ambiguousRows=rows.filter(row=>(row.phonemes||[]).length>1).length;
  const noSoundRows=rows.filter(row=>!(row.phonemes||[]).length).length;
  const multiSpellingPhonemes=[...uniquePhonemes].filter(p=>allGraphemesForPhoneme(lang,p).length>1).length;
  document.getElementById('orthographyCoverageTitle').textContent=profile.title;
  document.getElementById('orthographyCoverageTotal').textContent=`${rows.length} reviewed entries`;
  document.getElementById('orthographyVerificationLevel').textContent=verificationLabel(profile.status);
  document.getElementById('orthographyCoverageSummary').textContent=`${profile.system} · ${uniquePhonemes.size} listed phoneme/value labels · ${ambiguousRows} context-dependent entries · ${noSoundRows} non-phonemic signs.`;
  document.getElementById('orthographyProfileSummary').innerHTML=`<div><b>Reference variety</b>${escapeHTML(profile.variety)}</div><div><b>Coverage</b>${escapeHTML(profile.completeness)}</div><div><b>Model</b>Many-to-many grapheme ↔ phoneme/realization</div><div><b>Limitation</b>Word-level pronunciation still requires lexical and phonological context.</div>`;
  document.getElementById('orthographyCoverageBody').innerHTML=rows.map(row=>{
    const phonemeList=row.phonemes||[];
    const relClass=!phonemeList.length?'coverage-unmapped':phonemeList.length>1?'coverage-ambiguous':(row.relationship.includes('other spellings')?'coverage-composite':'coverage-neutral');
    const coverage=row.chartCoverage==='standalone'?'<span class="coverage-ok">Standalone chart cell</span>':row.chartCoverage==='partial'?'<span class="coverage-ambiguous">Partial chart coverage</span>':row.chartCoverage==='none'?'<span class="coverage-unmapped">No independent IPA phoneme</span>':'<span class="coverage-composite">Composite, sequence or feature</span>';
    const name=row.name?`<span class="coverage-grapheme-name">${escapeHTML(row.name)}</span>`:'';
    const role=row.role?`<span class="coverage-role">${escapeHTML(row.role)}</span>`:'';
    const phonemes=phonemeList.length?phonemeList.map(p=>`<code>/${escapeHTML(p)}/</code>`).join(' '):'<span class="source-note">—</span>';
    return `<tr><td>${escapeHTML(row.grapheme)}${name}${role}</td><td><div class="coverage-phonemes">${phonemes}</div></td><td><span class="${relClass}">${escapeHTML(row.relationship)}</span></td><td>${coverage}</td><td class="source-note">${escapeHTML(row.note||'Verified broad correspondence; consult the profile caveat for context.')}</td></tr>`;
  }).join('');
  const sourceLinks=(profile.sources||[]).map(s=>`<a href="${escapeHTML(s.url)}" target="_blank" rel="noreferrer">${escapeHTML(s.title)}</a>`).join(' · ');
  document.getElementById('orthographyCoverageNote').innerHTML=`<b>Verification note:</b> ${escapeHTML(profile.notes)}<div class="coverage-sources"><b>Profile sources:</b> ${sourceLinks}</div>`;
  section.hidden=false;
}
function hideOrthographyCoverage(){document.getElementById('orthographyCoverage').hidden=true;}
function splitGraphemes(value){return value?value.split('/').map(x=>x.trim()).filter(Boolean):[];}
function orthographyProfileFor(lang){return lang&&lang.iso?ORTHO_BY_ISO[lang.iso]:null;}
function graphemesForPhoneme(lang,phoneme){const model=LANGUAGE_PHONEME_MODELS[lang.iso];if(model&&model.phonemes&&model.phonemes[phoneme])return model.phonemes[phoneme].graphemes||[];const profile=orthographyProfileFor(lang);return profile&&ORTHO[profile]&&ORTHO[profile][phoneme]?splitGraphemes(ORTHO[profile][phoneme]):[];}
function reverseGraphemeMappings(lang){const out=new Map();const add=(g,p)=>{if(!out.has(g))out.set(g,new Set());out.get(g).add(p);};const profile=orthographyProfileFor(lang);if(profile&&ORTHO[profile])for(const [p,v] of Object.entries(ORTHO[profile]))for(const g of splitGraphemes(v))add(g,p);const model=LANGUAGE_PHONEME_MODELS[lang.iso];if(model&&model.phonemes)for(const [p,info] of Object.entries(model.phonemes))for(const g of info.graphemes||[])add(g,p);return out;}
function explicitLanguageRelation(lang,symbol){const model=LANGUAGE_PHONEME_MODELS[lang.iso];if(!model)return null;if(model.phones&&model.phones[symbol]){const r=model.phones[symbol];return {state:'variant',phonemes:r.phonemes||[],graphemes:r.graphemes||[],note:r.note||'contextual realization',confidence:'explicit',family:!!r.family};}if(model.phonemes){for(const [phoneme,info] of Object.entries(model.phonemes)){if(symbol===phoneme)return {state:'mapped',phonemes:[phoneme],graphemes:info.graphemes||[],note:'verified canonical phoneme',confidence:'verified'};if((info.realizations||[]).includes(symbol))return {state:'variant',phonemes:[phoneme],graphemes:info.graphemes||[],note:'alternative source transcription or phonetic realization',confidence:'verified'};}}return null;}
function languageSymbolState(lang,symbol,inventory){const explicit=explicitLanguageRelation(lang,symbol);if(explicit)return explicit;const exact=inventory.has(symbol);if(!exact)return {state:'absent',phonemes:[],graphemes:[],note:'not attested'};const graphemes=graphemesForPhoneme(lang,symbol);if(graphemes.length)return {state:'mapped',phonemes:[symbol],graphemes,note:'curated phoneme–grapheme mapping with exact PHOIBLE attestation',confidence:'curated'};return {state:'attested',phonemes:[symbol],graphemes:[],note:'exact source symbol attested; canonical cross-source interpretation unresolved',confidence:'dataset-only'};}
function mappingLabel(result,symbol){if(result.state==='mapped')return result.graphemes.length?result.graphemes.join(' · '):`/${result.phonemes.join(', ')}/`;if(result.state==='variant'){if(result.family)return result.graphemes.length?`${result.graphemes.join(' · ')} · verified click family`:'verified click family';const gs=result.graphemes.length?result.graphemes.join(' · ')+' · ':'';return `${gs}[${symbol}]→/${result.phonemes.join(', ')}/`;}if(result.state==='attested')return 'source-attested';return 'not attested';}
function mappingTitle(lang,result,symbol){const reverse=reverseGraphemeMappings(lang);const ambiguity=[];for(const g of result.graphemes||[]){const targets=[...(reverse.get(g)||[])];if(targets.length>1)ambiguity.push(`${g} also maps to /${targets.join(', ')}/`);}let base='';if(result.state==='mapped')base=`Mapped phoneme /${result.phonemes.join(', ')}/; grapheme(s): ${(result.graphemes||[]).join(', ')||'not available'}`;else if(result.state==='variant'&&result.family)base=`[${symbol}] is the verified anterior articulation of a complete click series; grapheme(s): ${(result.graphemes||[]).join(', ')||'not available'}`;else if(result.state==='variant')base=`IPA phone [${symbol}] realizes /${result.phonemes.join(', ')}/; grapheme(s): ${(result.graphemes||[]).join(', ')||'not available'}`;else if(result.state==='attested')base=`[${symbol}] is attested in at least one PHOIBLE inventory, but its canonical cross-source interpretation has not been independently resolved`;else base=`[${symbol}] is not attested in the current aggregated inventories/model`;return [base,result.note,...ambiguity].filter(Boolean).join(' · ');}
function keyName(n){return n.toLowerCase().replace(/\s*\([^)]*\)/g,'').replace(/^(standard|modern standard)\s+/,'standard ').trim()}
function graphemeFor(lang,symbol){const explicit=explicitLanguageRelation(lang,symbol);if(explicit&&explicit.graphemes&&explicit.graphemes.length)return explicit.graphemes.join(' · ');return graphemesForPhoneme(lang,symbol).join(' · ')||null;}
function renderLanguages(q=''){const s=q.trim().toLowerCase(); const rows=current.filter(x=>!s||x.name.toLowerCase().includes(s)||(x.iso||'').includes(s)||(x.glottocode||'').includes(s)); list.innerHTML=rows.map(x=>{const g=graphemeFor(x,currentSymbol);const pop=populationForLanguage(x);const relation=mappingStateForPopulation(x,currentSymbol);const included=relation.state==='mapped'||relation.state==='variant';const weighting=`<div class="speaker-line"><b>Population weighting:</b> <span class="${included?'population-included':'population-excluded'}">${included?`included in P (${relation.state==='mapped'?'green mapping':'amber realization'})`:'excluded from P (blue unresolved attestation)'}</span></div>`;const clickLine=x.clickSegments&&x.clickSegments.length?`<div class="speaker-line"><b>PHOIBLE click segments:</b> ${x.clickSegments.map(v=>`/${v}/`).join(' ')}</div>`:'';return `<div class="lang"><b>${x.name}</b><br><small>${x.iso?`ISO: ${x.iso} · `:''}${x.glottocode?`Representative Glottocode: ${x.glottocode}`:''}</small><div class="speaker-line">Estimated speakers: ${formatPeople(pop)}</div>${weighting}${clickLine}<div class="orthography"><span class="label">Grapheme(s):</span>${g?`<span class="grapheme">${g}</span>`:`<span class="missing">not available in the curated orthography profile</span>`}</div></div>`}).join('')||'<p>No results in the demographic set.</p>';}


const IPA_AUDIO_BASE='https://www.internationalphoneticalphabet.org/ipa-chart-audio/mp3/';

const IPA_OFFICIAL_AUDIO_BASE='https://www.internationalphoneticassociation.org/IPAcharts/inter_chart_2018/sounds/';
const IPA_OFFICIAL_CHART='https://www.internationalphoneticassociation.org/IPAcharts/IPA_charts_EI/IPA_charts_EI.html';
const IPA_OFFICIAL_ACK='https://www.internationalphoneticassociation.org/IPAcharts/common_files/IPA_charts_about.html';

const ipaAudio=document.getElementById('ipaAudio');
const ipaAudioSamples=document.getElementById('ipaAudioSamples');
const ipaAudioStatus=document.getElementById('ipaAudioStatus');
const ipaAudioLabel=document.getElementById('ipaAudioLabel');
let audioSymbol='';
let currentAudioButton=null;
function officialAudioHex(symbol){const points=Array.from(symbol);return points.length===1?points[0].codePointAt(0).toString(16).toUpperCase().padStart(4,'0'):null;}
function audioSampleRow({label,site,url,sourceUrl,available=true,official=false}){
  const row=document.createElement('div');row.className='audio-sample';
  const button=document.createElement('button');button.type='button';button.className='audio-play';button.textContent='▶';button.disabled=!available;button.setAttribute('aria-label',available?`Play ${label} recording for [${audioSymbol}]`:`${label} recording unavailable for [${audioSymbol}]`);button.title=button.getAttribute('aria-label');
  const meta=document.createElement('div');meta.className='audio-sample-meta';
  const name=document.createElement('span');name.className='audio-sample-name';name.textContent=label;
  const source=document.createElement('span');source.className='audio-sample-source';source.append(official?'Official recording · ':'Supplemental recording · ');
  const link=document.createElement('a');link.href=sourceUrl;link.target='_blank';link.rel='noreferrer';link.textContent=site;source.append(link);
  meta.append(name,source);row.append(button,meta);
  if(available)button.addEventListener('click',()=>playAudioSample(button,url,label));
  return row;
}
function stopAudio(){ipaAudio.pause();ipaAudio.removeAttribute('src');ipaAudio.load();if(currentAudioButton){currentAudioButton.textContent='▶';currentAudioButton.removeAttribute('aria-pressed');currentAudioButton=null;}}
function playAudioSample(button,url,label){stopAudio();currentAudioButton=button;button.textContent='■';button.setAttribute('aria-pressed','true');ipaAudio.src=url;ipaAudio.load();ipaAudio.autoplay=false;ipaAudio.currentTime=0;ipaAudioStatus.textContent=`Loading ${label} for [${audioSymbol}]…`;const p=ipaAudio.play();if(p&&typeof p.catch==='function')p.catch(()=>{ipaAudioStatus.textContent=`The ${label} recording is unavailable or playback was blocked.`;stopAudio();});}
function configureSymbolAudio(symbol){
  audioSymbol=symbol;stopAudio();ipaAudioSamples.replaceChildren();ipaAudioLabel.textContent=`[${symbol}]`;
  const supplementalFile=IPA_AUDIO_FILES[symbol];
  ipaAudioSamples.append(audioSampleRow({label:'Reference sound',site:'InternationalPhoneticAlphabet.org',url:supplementalFile?IPA_AUDIO_BASE+encodeURIComponent(supplementalFile):'',sourceUrl:'https://www.internationalphoneticalphabet.org/ipa-sounds/ipa-chart-with-sounds/',available:Boolean(supplementalFile),official:false}));
  const hex=officialAudioHex(symbol);
  for(const voice of IPA_AUDIO_VOICES){
    const url=hex?`${IPA_OFFICIAL_AUDIO_BASE}${voice.code}/${hex}.mp3`:'';
    ipaAudioSamples.append(audioSampleRow({label:voice.name,site:'International Phonetic Association',url,sourceUrl:IPA_OFFICIAL_CHART,available:Boolean(hex),official:true}));
  }
  ipaAudioStatus.textContent=hex?'Five entries are ready when the remote sources provide the selected recording. Press a Play button.':'The supplemental entry may be available, but the official chart does not expose a single-code-point audio path for this compound symbol.';
}
ipaAudio.addEventListener('play',()=>{ipaAudioStatus.textContent=`Playing [${audioSymbol}]…`;});
ipaAudio.addEventListener('ended',()=>{ipaAudioStatus.textContent=`Playback of [${audioSymbol}] completed.`;stopAudio();});
ipaAudio.addEventListener('error',()=>{ipaAudioStatus.textContent='This recording is not available from its remote source.';stopAudio();});


const CLICK_SYMBOLS=new Set(['ʘ','ǀ','ǃ','ǂ','ǁ']);
const PHOIBLE_VALUES_URL='https://raw.githubusercontent.com/cldf-datasets/phoible/v2.0.1/cldf/values.csv';
const CLICK_FAMILY_DATA=Object.fromEntries([...CLICK_SYMBOLS].map(symbol=>[symbol,{languages:[],segments:[],family:true}]));
let clickFamilyStatus='loading';
let clickFamilyError='';

function symbolDataset(symbol){return CLICK_SYMBOLS.has(symbol)?CLICK_FAMILY_DATA[symbol]:DATA[symbol];}

function parseCsvRows(text,onRow){
  let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'){
        if(text[i+1]==='"'){field+='"';i++;}
        else quoted=false;
      }else field+=ch;
    }else if(ch==='"')quoted=true;
    else if(ch===','){row.push(field);field='';}
    else if(ch==='\n'){
      row.push(field.replace(/\r$/,''));field='';
      if(row.length>1)onRow(row);
      row=[];
    }else field+=ch;
  }
  if(field||row.length){row.push(field.replace(/\r$/,''));onRow(row);}
}

function buildGlottocodeLookup(){
  const map=new Map();
  for(const d of Object.values(DATA))for(const lang of d.languages||[]){
    if(!lang.glottocode||!lang.iso)continue;
    if(!map.has(lang.glottocode))map.set(lang.glottocode,{name:lang.name,iso:lang.iso,glottocode:lang.glottocode});
  }
  return map;
}

function setClickButtonState(symbol,status){
  const button=document.querySelector(`.sym[data-symbol="${CSS.escape(symbol)}"]`);
  if(!button)return;
  const l=button.querySelector('.language-count')||button.querySelector('small');
  const p=button.querySelector('.speaker-count');
  if(status==='loading'){
    if(l){l.classList.add('language-count');l.textContent='L …';}
    if(p)p.textContent='P …';
    button.title='Loading PHOIBLE click-family data…';
    return;
  }
  if(status==='error'){
    if(l)l.textContent='L —';
    if(p)p.textContent='P —';
    button.title='Click-family data unavailable; the isolated symbol is not treated as zero.';
    return;
  }
  const ps=speakerStats(CLICK_FAMILY_DATA[symbol],symbol);
  if(l)l.textContent='L '+ps.languageCount;
  if(p)p.textContent='P '+formatPeople(ps.total);
  button.title=`L ${ps.languageCount} source-attested languages · P ${formatPeople(ps.total)} from ${ps.populationLanguageCount} green/amber languages · aggregated from complete PHOIBLE click segments`;
}

function refreshClickButtons(status=clickFamilyStatus){for(const symbol of CLICK_SYMBOLS)setClickButtonState(symbol,status);}

async function loadClickFamilyData(){
  refreshClickButtons('loading');
  try{
    const response=await fetch(PHOIBLE_VALUES_URL,{mode:'cors',cache:'force-cache'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const csv=await response.text();
    const glottocodeLookup=buildGlottocodeLookup();
    const familyInventories=Object.fromEntries([...CLICK_SYMBOLS].map(symbol=>[symbol,new Map()]));
    let header=null,index={};
    parseCsvRows(csv,row=>{
      if(!header){header=row;header.forEach((name,i)=>index[name]=i);return;}
      const value=row[index.Value]||'';
      if(!value)return;
      const matched=[...CLICK_SYMBOLS].filter(symbol=>value.includes(symbol));
      if(!matched.length)return;
      const glottocode=row[index.Language_ID]||'';
      const base=glottocodeLookup.get(glottocode);
      if(!base)return;
      const contribution=row[index.Contribution_ID]||row[index.Inventory_ID]||'';
      for(const symbol of matched){
        const key=`${contribution}|${glottocode}|${base.iso}`;
        let rec=familyInventories[symbol].get(key);
        if(!rec){rec={...base,inventoryId:contribution,clickSegments:[]};familyInventories[symbol].set(key,rec);}
        if(!rec.clickSegments.includes(value))rec.clickSegments.push(value);
      }
    });
    for(const symbol of CLICK_SYMBOLS){
      const languages=[...familyInventories[symbol].values()];
      const segments=[...new Set(languages.flatMap(x=>x.clickSegments))].sort();
      CLICK_FAMILY_DATA[symbol]={languages,segments,family:true};
      for(const lang of languages){
        const k=langKey(lang);
        if(!LANGUAGE_SYMBOLS.has(k))LANGUAGE_SYMBOLS.set(k,new Set());
        LANGUAGE_SYMBOLS.get(k).add(symbol);
      }
    }
    clickFamilyStatus='ready';clickFamilyError='';refreshClickButtons('ready');
    if(selectedLanguage)applyLanguageHighlight(selectedLanguage);
    if(drawer.classList.contains('open')&&CLICK_SYMBOLS.has(currentSymbol))openSymbol(currentSymbol);
  }catch(error){
    clickFamilyStatus='error';clickFamilyError=error&&error.message?error.message:String(error);refreshClickButtons('error');
    if(drawer.classList.contains('open')&&CLICK_SYMBOLS.has(currentSymbol))openSymbol(currentSymbol);
  }
}

function openSymbol(s){currentSymbol=s;const d=symbolDataset(s);const ps=speakerStats(d,s); document.getElementById('dsym').textContent=s; document.getElementById('dtitle').textContent=CLICK_SYMBOLS.has(s)?(clickFamilyStatus==='ready'?'Click-family aggregation in PHOIBLE 2.0.1':clickFamilyStatus==='loading'?'Loading PHOIBLE click-family aggregation…':`Click-family data unavailable${clickFamilyError?': '+clickFamilyError:''}`):'Exact symbol attestation in PHOIBLE sources';configureSymbolAudio(s); const pending=CLICK_SYMBOLS.has(s)&&clickFamilyStatus!=='ready'; document.getElementById('dcount').textContent=pending?(clickFamilyStatus==='loading'?'…':'—'):ps.languageCount; document.getElementById('dpct').textContent=pending?'—':ps.languagePct.toLocaleString('en-US',{maximumFractionDigits:1})+'%'; document.getElementById('dpeople').textContent=pending?'—':formatPeople(ps.total); document.getElementById('dweight').textContent=pending?'—':ps.pct.toLocaleString('en-US',{maximumFractionDigits:1})+'%'; document.getElementById('ddoculects').textContent=pending?'—':ps.doculectCount; current=pending?[]:ps.languages; lsearch.value=''; renderLanguages(); drawer.classList.add('open'); drawer.setAttribute('aria-hidden','false');}
const LANGUAGE_SYMBOLS=new Map();
const LANGUAGE_RECORDS=new Map();
for(const [symbol,d] of Object.entries(DATA)){
  for(const lang of d.languages){
    const k=langKey(lang);
    if(!LANGUAGE_SYMBOLS.has(k)) LANGUAGE_SYMBOLS.set(k,new Set());
    LANGUAGE_SYMBOLS.get(k).add(symbol);
    if(!LANGUAGE_RECORDS.has(k)) LANGUAGE_RECORDS.set(k,{key:k,iso:lang.iso,glottocode:lang.glottocode,names:new Set(),glottocodes:new Set()});
    const rec=LANGUAGE_RECORDS.get(k);rec.names.add(lang.name);if(lang.glottocode)rec.glottocodes.add(lang.glottocode);
  }
}
let englishLanguageNames=null;
try{englishLanguageNames=new Intl.DisplayNames(['en'],{type:'language'});}catch(e){}
function preferredLanguageName(iso,names){
  let canonical='';
  if(englishLanguageNames&&iso&&iso!=='mis'&&iso!=='und'){try{canonical=englishLanguageNames.of(iso)||'';}catch(e){}}
  if(canonical&&canonical.toLowerCase()!==iso.toLowerCase()) return canonical;
  const candidates=[...names].sort((a,b)=>{const au=a===a.toUpperCase()?1:0,bu=b===b.toUpperCase()?1:0;return au-bu+(a.includes(';')?1:0)-(b.includes(';')?1:0)||a.length-b.length||a.localeCompare(b);});
  return candidates[0]||iso;
}
const LANGUAGE_DIRECTORY=[...LANGUAGE_RECORDS.values()].map(rec=>({key:rec.key,iso:rec.iso,glottocode:rec.glottocode,name:preferredLanguageName(rec.iso,rec.names),aliases:[...rec.names],glottocodes:[...rec.glottocodes],speakers:SPEAKER_ESTIMATES[rec.iso]||0,demographic:!!(rec.iso&&SPEAKER_ESTIMATES[rec.iso])})).sort((a,b)=>a.name.localeCompare(b.name,'en'));
const LANGUAGE_LOOKUP=new Map();
for(const lang of LANGUAGE_DIRECTORY){
  LANGUAGE_LOOKUP.set(lang.key.toLowerCase(),lang);
  LANGUAGE_LOOKUP.set(lang.name.toLowerCase(),lang);
  if(lang.iso&&lang.iso!=='mis'&&lang.iso!=='und') LANGUAGE_LOOKUP.set(lang.iso.toLowerCase(),lang);
  for(const alias of lang.aliases){const a=alias.toLowerCase();if(!LANGUAGE_LOOKUP.has(a))LANGUAGE_LOOKUP.set(a,lang);}
}
const selector=document.getElementById('languageSelector');
const languageSearchInput=document.getElementById('languageSearchInput');
const languageOptions=document.getElementById('languageOptions');
const languageMode=document.getElementById('languageMode');
const selectedLanguageLabel=document.getElementById('selectedLanguageLabel');
const selectedLanguageStats=document.getElementById('selectedLanguageStats');
languageOptions.innerHTML=LANGUAGE_DIRECTORY.map(lang=>`<option value="${lang.name.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">${languageCodeLabel(lang)}</option>`).join('');selector.innerHTML='<option value="">Select language...</option>'+LANGUAGE_DIRECTORY.map(lang=>`<option value="${lang.key}">${lang.name} (${languageCodeLabel(lang)})</option>`).join('');
let selectedLanguage=null;
function clearLanguageHighlight(preserveInput=false){
  selectedLanguage=null;if(!preserveInput){selector.value='';languageSearchInput.value='';}languageMode.hidden=true;hideOrthographyCoverage();
  document.querySelectorAll('.sym').forEach(button=>{button.classList.remove('lang-present','lang-variant','lang-attested','lang-absent');const old=button.querySelector('.selected-grapheme');if(old)old.remove();});
}
function applyLanguageHighlight(lang){
  selectedLanguage=lang;selector.value=langKey(lang);languageSearchInput.value=lang.name;const inventory=LANGUAGE_SYMBOLS.get(langKey(lang))||new Set();let mappedCount=0,variantCount=0,attestedCount=0;
  document.querySelectorAll('.sym').forEach(button=>{
    const symbol=button.dataset.symbol;const result=languageSymbolState(lang,symbol,inventory);
    if(result.state==='mapped')mappedCount++;else if(result.state==='variant')variantCount++;else if(result.state==='attested')attestedCount++;
    button.classList.toggle('lang-present',result.state==='mapped');
    button.classList.toggle('lang-variant',result.state==='variant');
    button.classList.toggle('lang-attested',result.state==='attested');
    button.classList.toggle('lang-absent',result.state==='absent');
    const old=button.querySelector('.selected-grapheme');if(old)old.remove();
    const label=document.createElement('small');label.className='selected-grapheme';label.textContent=mappingLabel(result,symbol);label.title=mappingTitle(lang,result,symbol);
    if(result.state==='mapped'&&!result.graphemes.length)label.classList.add('no-spelling');
    else if(result.state==='variant')label.classList.add('variant-spelling');
    else if(result.state==='attested')label.classList.add('attested-spelling');
    else if(result.state==='absent')label.classList.add('not-present');
    button.appendChild(label);
  });
  const total=document.querySelectorAll('.sym').length;
  selectedLanguageLabel.textContent=lang.name;
  const vp=profileForLanguage(lang);selectedLanguageStats.textContent=`${mappedCount} mapped phonemes · ${variantCount} alternative realizations · ${attestedCount} source-attested unresolved · ${total-mappedCount-variantCount-attestedCount} not attested · ${formatPeople(lang.speakers)} estimated speakers · ${vp?verificationLabel(vp.status):'no independently verified orthography profile'}`;
  languageMode.hidden=false;renderOrthographyCoverage(lang);
}
function resolveLanguage(value,allowPrefix=false){
  const query=value.trim().toLowerCase();if(!query){clearLanguageHighlight();return null;}
  let lang=LANGUAGE_LOOKUP.get(query)||null;
  if(!lang&&allowPrefix){const matches=LANGUAGE_DIRECTORY.filter(x=>x.name.toLowerCase().startsWith(query)||x.aliases.some(a=>a.toLowerCase().startsWith(query)));if(matches.length===1)lang=matches[0];}
  if(lang)applyLanguageHighlight(lang);else if(selectedLanguage)clearLanguageHighlight(true);
  return lang;
}
languageSearchInput.addEventListener('input',()=>{resolveLanguage(languageSearchInput.value,false);});
languageSearchInput.addEventListener('change',()=>{resolveLanguage(languageSearchInput.value,true);});
languageSearchInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();resolveLanguage(languageSearchInput.value,true);}});
selector.addEventListener('change',()=>{const lang=LANGUAGE_LOOKUP.get(selector.value.toLowerCase());if(lang)applyLanguageHighlight(lang);else clearLanguageHighlight();});
document.getElementById('clearLanguage').addEventListener('click',()=>clearLanguageHighlight());

document.getElementById('languageBaseBadge').textContent=DEMOGRAPHIC_LANGUAGE_COUNT+' languages with demographic data';
document.getElementById('speakerBaseBadge').textContent='weighted base: '+formatPeople(SPEAKER_BASE);
document.querySelectorAll('.sym').forEach(b=>{const symbol=b.dataset.symbol;const d=symbolDataset(symbol);const ps=speakerStats(d,symbol);const languageSmall=b.querySelector('small');if(languageSmall){languageSmall.classList.add('language-count');languageSmall.textContent=CLICK_SYMBOLS.has(symbol)?'L …':'L '+ps.languageCount;}const speakerSmall=document.createElement('small');speakerSmall.className='speaker-count';speakerSmall.textContent=CLICK_SYMBOLS.has(symbol)?'P …':'P '+formatPeople(ps.total);b.appendChild(speakerSmall);b.title=CLICK_SYMBOLS.has(symbol)?'Loading PHOIBLE click-family data…':`L ${ps.languageCount} source-attested languages · P ${formatPeople(ps.total)} from ${ps.populationLanguageCount} green/amber languages`;b.addEventListener('click',()=>openSymbol(symbol));}); document.getElementById('close').addEventListener('click',()=>{drawer.classList.remove('open');drawer.setAttribute('aria-hidden','true')}); lsearch.addEventListener('input',()=>renderLanguages(lsearch.value));
loadClickFamilyData();
/* Unified search is installed by the technical-features module below. */ document.addEventListener('keydown',e=>{if(e.key==='Escape'){drawer.classList.remove('open');if(document.activeElement!==selector&&document.activeElement!==languageSearchInput)return;clearLanguageHighlight();}});

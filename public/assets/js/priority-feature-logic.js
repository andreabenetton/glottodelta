
/* This layer extends the existing data/model without changing its embedded sources. */
const comparisonSelector=document.getElementById('comparisonLanguageSelector');
const comparisonSearchInput=document.getElementById('comparisonLanguageSearchInput');
const comparisonPicker=document.getElementById('comparisonLanguagePicker');
const clearComparisonButton=document.getElementById('clearComparisonLanguage');
const evidenceFilterControl=document.getElementById('evidenceFilter');
const differencesOnlyControl=document.getElementById('differencesOnly');
const singleLanguageLegend=document.getElementById('singleLanguageLegend');
const comparisonLanguageLegend=document.getElementById('comparisonLanguageLegend');
const auditSummary=document.getElementById('auditSummary');
const auditFilters=document.getElementById('auditFilters');
let comparisonLanguage=null;
let evidenceMode='all';
let differencesOnlyMode=false;
let currentAuditFilter='all';

comparisonSelector.innerHTML='<option value="">Select comparison language...</option>'+LANGUAGE_DIRECTORY.map(lang=>`<option value="${lang.iso}">${escapeHTML(lang.name)} (${lang.iso.toUpperCase()})</option>`).join('');

function evidenceModeLabel(){
  return {all:'green, amber and blue',population:'green and amber',mapped:'green only',variant:'amber only',attested:'blue only'}[evidenceMode]||'all evidence';
}
function evidenceStateIncluded(state){
  if(evidenceMode==='all')return state==='mapped'||state==='variant'||state==='attested';
  if(evidenceMode==='population')return state==='mapped'||state==='variant';
  return state===evidenceMode;
}
function stateShortLabel(state){return {mapped:'green',variant:'amber',attested:'blue',absent:'absent'}[state]||state;}
function clearSymbolModeClasses(button){
  button.classList.remove('lang-present','lang-variant','lang-attested','lang-absent','evidence-filtered','compare-shared','compare-only-a','compare-only-b','compare-neither','compare-suppressed');
  const oldMapping=button.querySelector('.selected-grapheme');if(oldMapping)oldMapping.remove();
  const oldComparison=button.querySelector('.comparison-state');if(oldComparison)oldComparison.remove();
}
function enableComparisonControls(enabled){
  comparisonSearchInput.disabled=!enabled;comparisonSelector.disabled=!enabled;clearComparisonButton.disabled=!enabled;
  comparisonPicker.classList.toggle('is-disabled',!enabled);
  comparisonSearchInput.placeholder=enabled?'Search comparison language by English name':'Select primary language first';
  differencesOnlyControl.disabled=!(enabled&&comparisonLanguage);
}
function resetAllSymbolModes(){document.querySelectorAll('.sym').forEach(clearSymbolModeClasses);}

function renderSingleLanguageHighlight(lang){
  const inventory=LANGUAGE_SYMBOLS.get(langKey(lang))||new Set();let mappedCount=0,variantCount=0,attestedCount=0;
  document.querySelectorAll('.sym').forEach(button=>{
    clearSymbolModeClasses(button);
    const symbol=button.dataset.symbol;const result=languageSymbolState(lang,symbol,inventory);
    if(result.state==='mapped')mappedCount++;else if(result.state==='variant')variantCount++;else if(result.state==='attested')attestedCount++;
    button.classList.toggle('lang-present',result.state==='mapped');
    button.classList.toggle('lang-variant',result.state==='variant');
    button.classList.toggle('lang-attested',result.state==='attested');
    button.classList.toggle('lang-absent',result.state==='absent');
    if(evidenceMode!=='all'&&!evidenceStateIncluded(result.state))button.classList.add('evidence-filtered');
    const label=document.createElement('small');label.className='selected-grapheme';label.textContent=mappingLabel(result,symbol);label.title=mappingTitle(lang,result,symbol);
    if(result.state==='mapped'&&!result.graphemes.length)label.classList.add('no-spelling');
    else if(result.state==='variant')label.classList.add('variant-spelling');
    else if(result.state==='attested')label.classList.add('attested-spelling');
    else if(result.state==='absent')label.classList.add('not-present');
    button.appendChild(label);
  });
  const total=document.querySelectorAll('.sym').length;
  selectedLanguageLabel.textContent=lang.name;
  const vp=profileForLanguage(lang);
  selectedLanguageStats.textContent=`${mappedCount} mapped · ${variantCount} alternative · ${attestedCount} unresolved · ${total-mappedCount-variantCount-attestedCount} absent · filter: ${evidenceModeLabel()} · ${isDemographic(lang)?formatPeople(populationForLanguage(lang))+' estimated speakers (demographic-certain, in P)':'attested only — no population estimate, excluded from P'} · ${vp?verificationLabel(vp.status):'no independently verified orthography profile'}`;
  singleLanguageLegend.hidden=false;comparisonLanguageLegend.hidden=true;languageMode.hidden=false;renderOrthographyCoverage(lang);
}

function renderComparisonHighlight(){
  if(!selectedLanguage||!comparisonLanguage){if(selectedLanguage)renderSingleLanguageHighlight(selectedLanguage);return;}
  const primaryCode=selectedLanguage.iso.toUpperCase();
  const comparisonCode=comparisonLanguage.iso.toUpperCase();
  const inventoryA=LANGUAGE_SYMBOLS.get(langKey(selectedLanguage))||new Set();
  const inventoryB=LANGUAGE_SYMBOLS.get(langKey(comparisonLanguage))||new Set();
  let shared=0,onlyA=0,onlyB=0,neither=0;
  document.querySelectorAll('.sym').forEach(button=>{
    clearSymbolModeClasses(button);
    const symbol=button.dataset.symbol;
    const resultA=languageSymbolState(selectedLanguage,symbol,inventoryA);
    const resultB=languageSymbolState(comparisonLanguage,symbol,inventoryB);
    const presentA=evidenceStateIncluded(resultA.state),presentB=evidenceStateIncluded(resultB.state);
    let category,label;
    if(presentA&&presentB){category='shared';label=`${primaryCode} + ${comparisonCode}`;shared++;}
    else if(presentA){category='only-a';label=`${primaryCode} only`;onlyA++;}
    else if(presentB){category='only-b';label=`${comparisonCode} only`;onlyB++;}
    else{category='neither';label='—';neither++;}
    button.classList.add(`compare-${category}`);
    if(differencesOnlyMode&&(category==='shared'||category==='neither'))button.classList.add('compare-suppressed');
    const stateLabel=document.createElement('small');stateLabel.className='comparison-state';stateLabel.textContent=label;
    stateLabel.title=`${primaryCode} (${selectedLanguage.name}): ${stateShortLabel(resultA.state)}. ${comparisonCode} (${comparisonLanguage.name}): ${stateShortLabel(resultB.state)}. Evidence filter: ${evidenceModeLabel()}.`;
    button.appendChild(stateLabel);
    button.title=`${symbol} · ${primaryCode} ${selectedLanguage.name}: ${stateShortLabel(resultA.state)} · ${comparisonCode} ${comparisonLanguage.name}: ${stateShortLabel(resultB.state)} · ${label}`;
  });
  selectedLanguageLabel.textContent=`${primaryCode}: ${selectedLanguage.name} ↔ ${comparisonCode}: ${comparisonLanguage.name}`;
  selectedLanguageStats.textContent=`${shared} shared · ${onlyA} ${primaryCode} only · ${onlyB} ${comparisonCode} only · ${neither} absent under filter · evidence: ${evidenceModeLabel()}${differencesOnlyMode?' · only differences shown':''}`;
  document.getElementById('comparisonLegendShared').textContent=`Present in ${primaryCode} and ${comparisonCode}`;
  document.getElementById('comparisonLegendPrimary').textContent=`${primaryCode} only`;
  document.getElementById('comparisonLegendSecondary').textContent=`${comparisonCode} only`;
  singleLanguageLegend.hidden=true;comparisonLanguageLegend.hidden=false;languageMode.hidden=false;hideOrthographyCoverage();differencesOnlyControl.disabled=false;
}

applyLanguageHighlight=function(lang){
  selectedLanguage=lang;selector.value=lang.iso;languageSearchInput.value=lang.name;enableComparisonControls(true);
  if(comparisonLanguage&&langKey(comparisonLanguage)===langKey(lang))clearComparisonLanguage();
  if(comparisonLanguage)renderComparisonHighlight();else renderSingleLanguageHighlight(lang);
};

clearComparisonLanguage=function(preserveInput=false){
  comparisonLanguage=null;
  if(!preserveInput){comparisonSelector.value='';comparisonSearchInput.value='';}
  differencesOnlyMode=false;differencesOnlyControl.checked=false;differencesOnlyControl.disabled=true;
  if(selectedLanguage)renderSingleLanguageHighlight(selectedLanguage);else{resetAllSymbolModes();languageMode.hidden=true;}
};

clearLanguageHighlight=function(preserveInput=false){
  selectedLanguage=null;comparisonLanguage=null;
  if(!preserveInput){selector.value='';languageSearchInput.value='';comparisonSelector.value='';comparisonSearchInput.value='';}
  differencesOnlyMode=false;differencesOnlyControl.checked=false;differencesOnlyControl.disabled=true;enableComparisonControls(false);
  languageMode.hidden=true;singleLanguageLegend.hidden=false;comparisonLanguageLegend.hidden=true;hideOrthographyCoverage();resetAllSymbolModes();
};

function resolveComparisonLanguage(value,allowPrefix=false){
  const query=value.trim().toLowerCase();if(!query){clearComparisonLanguage();return null;}
  let lang=LANGUAGE_LOOKUP.get(query)||null;
  if(!lang&&allowPrefix){const matches=LANGUAGE_DIRECTORY.filter(x=>x.name.toLowerCase().startsWith(query)||x.aliases.some(a=>a.toLowerCase().startsWith(query)));if(matches.length===1)lang=matches[0];}
  if(lang){
    if(selectedLanguage&&langKey(lang)===langKey(selectedLanguage)){comparisonSearchInput.setCustomValidity('Choose a different language for comparison.');comparisonSearchInput.reportValidity();return null;}
    comparisonSearchInput.setCustomValidity('');comparisonLanguage=lang;comparisonSelector.value=lang.iso;comparisonSearchInput.value=lang.name;differencesOnlyControl.disabled=false;renderComparisonHighlight();
  }else if(comparisonLanguage)clearComparisonLanguage(true);
  return lang;
}
comparisonSearchInput.addEventListener('input',()=>resolveComparisonLanguage(comparisonSearchInput.value,false));
comparisonSearchInput.addEventListener('change',()=>resolveComparisonLanguage(comparisonSearchInput.value,true));
comparisonSearchInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();resolveComparisonLanguage(comparisonSearchInput.value,true);}});
comparisonSelector.addEventListener('change',()=>{const lang=LANGUAGE_LOOKUP.get(comparisonSelector.value.toLowerCase());if(lang){comparisonLanguage=lang;comparisonSearchInput.value=lang.name;differencesOnlyControl.disabled=false;renderComparisonHighlight();}else clearComparisonLanguage();});
clearComparisonButton.addEventListener('click',()=>clearComparisonLanguage());
evidenceFilterControl.addEventListener('change',()=>{evidenceMode=evidenceFilterControl.value;if(comparisonLanguage)renderComparisonHighlight();else if(selectedLanguage)renderSingleLanguageHighlight(selectedLanguage);});
differencesOnlyControl.addEventListener('change',()=>{differencesOnlyMode=differencesOnlyControl.checked;if(comparisonLanguage)renderComparisonHighlight();});

function relationForAudit(lang){return mappingStateForPopulation(lang,currentSymbol);}
function auditFilterMatches(relation){
  if(currentAuditFilter==='all')return true;
  if(currentAuditFilter==='included')return relation.state==='mapped'||relation.state==='variant';
  return relation.state===currentAuditFilter;
}
function evidenceBadgeLabel(state){return {mapped:'Green — verified mapping',variant:'Amber — verified realization',attested:'Blue — unresolved source attestation',absent:'Red — not attested'}[state]||state;}
function setAuditFilter(filter,focusList=false){
  currentAuditFilter=filter;
  document.querySelectorAll('[data-audit-filter]').forEach(button=>{if(button.classList.contains('audit-filter'))button.setAttribute('aria-pressed',String(button.dataset.auditFilter===filter));});
  renderLanguages(lsearch.value);
  if(focusList)lsearch.focus();
}

renderLanguages=function(q=''){
  const s=q.trim().toLowerCase();
  const rows=current.filter(x=>{
    const relation=relationForAudit(x);
    return auditFilterMatches(relation)&&(!s||x.name.toLowerCase().includes(s)||(x.iso||'').includes(s)||(x.glottocode||'').includes(s));
  });
  list.innerHTML=rows.map(x=>{
    const g=graphemeFor(x,currentSymbol);const pop=populationForLanguage(x);const relation=relationForAudit(x);const included=relation.state==='mapped'||relation.state==='variant';const demo=isDemographic(x);
    const speakerLine=demo?`<div class="speaker-line">Estimated speakers: ${formatPeople(pop)}</div>`:`<div class="speaker-line population-excluded">No population estimate — attested only</div>`;
    const weighting=demo?`<div class="speaker-line"><b>Population weighting:</b> <span class="${included?'population-included':'population-excluded'}">${included?`included in P (${relation.state==='mapped'?'green mapping':'amber realization'})`:'excluded from P (blue unresolved attestation)'}</span></div>`:`<div class="speaker-line"><b>Population weighting:</b> <span class="population-excluded">not in the P universe (no demographic estimate)</span></div>`;
    const clickLine=x.clickSegments&&x.clickSegments.length?`<div class="speaker-line"><b>PHOIBLE click segments:</b> ${x.clickSegments.map(v=>`/${escapeHTML(v)}/`).join(' ')}</div>`:'';
    return `<div class="lang"><b>${escapeHTML(x.name)}</b><br><small>${x.iso?`ISO: ${escapeHTML(x.iso)} · `:''}${x.glottocode?`Representative Glottocode: ${escapeHTML(x.glottocode)}`:''}</small><br><span class="evidence-badge ${relation.state}">${evidenceBadgeLabel(relation.state)}</span>${speakerLine}${weighting}${clickLine}<div class="orthography"><span class="label">Grapheme(s):</span>${g?`<span class="grapheme">${escapeHTML(g)}</span>`:`<span class="missing">not available in the curated orthography profile</span>`}</div></div>`;
  }).join('')||'<p>No languages match the selected evidence filter and search.</p>';
};

function updateAuditSummary(ps,pending=false){
  if(pending){auditSummary.innerHTML='<div class="audit-summary-item attested"><b>Loading</b>Click-family evidence is being retrieved from PHOIBLE.</div>';return;}
  const summary={mapped:{count:0,pop:0},variant:{count:0,pop:0},attested:{count:0,pop:0}};
  for(const lang of ps.languages){const relation=mappingStateForPopulation(lang,currentSymbol);if(summary[relation.state]){summary[relation.state].count++;summary[relation.state].pop+=populationForLanguage(lang);}}
  auditSummary.innerHTML=`<div class="audit-summary-item mapped"><b>Green · ${summary.mapped.count} languages</b>${formatPeople(summary.mapped.pop)} included in P</div><div class="audit-summary-item variant"><b>Amber · ${summary.variant.count} languages</b>${formatPeople(summary.variant.pop)} included in P</div><div class="audit-summary-item attested"><b>Blue · ${summary.attested.count} languages</b>${formatPeople(summary.attested.pop)} excluded from P</div>`;
  const labels={all:`All L (${ps.languageCount})`,included:`Included in P (${ps.populationLanguageCount})`,mapped:`Green (${summary.mapped.count})`,variant:`Amber (${summary.variant.count})`,attested:`Blue (${summary.attested.count})`};
  document.querySelectorAll('.audit-filter').forEach(button=>{button.textContent=labels[button.dataset.auditFilter]||button.textContent;});
}


function updateQualityIndicators(ps,pending=false){
  const confidence=document.getElementById('qualityConfidence');
  const sourceNode=document.getElementById('qualitySources');
  const verifiedNode=document.getElementById('qualityVerified');
  const populationNode=document.getElementById('qualityPopulation');
  const divergenceNode=document.getElementById('qualityDivergence');
  const versionNode=document.getElementById('qualityVersion');
  const demographicNode=document.getElementById('qualityDemographic');
  const detailsNode=document.getElementById('qualityDetails');
  confidence.className='quality-grade';
  if(pending){
    confidence.textContent='Loading';sourceNode.textContent='…';verifiedNode.textContent='…';populationNode.textContent='…';divergenceNode.textContent='…';demographicNode.textContent='…';
    versionNode.textContent='PHOIBLE 2.0.1';
    detailsNode.textContent='Click-family inventory evidence is being loaded from the PHOIBLE 2.0.1 CLDF ValueTable.';
    return;
  }
  const counts={mapped:0,variant:0,attested:0};
  let attestedPopulation=0;
  for(const lang of ps.languages){
    const relation=mappingStateForPopulation(lang,currentSymbol);
    if(counts[relation.state]!==undefined)counts[relation.state]++;
    attestedPopulation+=populationForLanguage(lang);
  }
  const verifiedCount=counts.mapped+counts.variant;
  const verifiedShare=ps.languageCount?verifiedCount/ps.languageCount:0;
  const populationCoverage=attestedPopulation?ps.total/attestedPopulation:0;
  const divergenceCount=counts.variant+counts.attested;
  const dataset=symbolDataset(currentSymbol)||{};
  const inventoryAttestations=Number.isFinite(dataset.inventories)?dataset.inventories:ps.doculectCount;
  const sourceDepth=Math.min(1,Math.log10(Math.max(1,inventoryAttestations)+1)/2.5);
  const score=.55*verifiedShare+.30*populationCoverage+.15*sourceDepth;
  const label=score>=.75?'High':score>=.45?'Medium':'Limited';
  confidence.textContent=label;
  confidence.classList.add(label.toLowerCase());
  sourceNode.textContent=inventoryAttestations.toLocaleString('en-US');
  verifiedNode.textContent=`${verifiedCount}/${ps.languageCount} · ${(verifiedShare*100).toLocaleString('en-US',{maximumFractionDigits:1})}%`;
  populationNode.textContent=`${(populationCoverage*100).toLocaleString('en-US',{maximumFractionDigits:1})}%`;
  divergenceNode.textContent=`${divergenceCount} (${counts.variant} amber · ${counts.attested} blue)`;
  versionNode.textContent=CLICK_SYMBOLS.has(currentSymbol)?'PHOIBLE 2.0.1':'PHOIBLE 2.0';
  demographicNode.textContent=`${ps.languageCount}/${ps.languageCount} · ${ps.languageCount?'100':'0'}%`;
  detailsNode.textContent=`${counts.mapped} green, ${counts.variant} amber and ${counts.attested} blue languages. “Amber + blue” is a proxy for alternative or unresolved analyses, not a count of independent publications. Confidence combines verified-language share (55%), population coverage within L (30%) and attestation depth (15%).`;
}

openSymbol=function(s){
  currentSymbol=s;const d=symbolDataset(s);const ps=speakerStats(d,s);
  document.getElementById('dsym').textContent=s;
  document.getElementById('dtitle').textContent=CLICK_SYMBOLS.has(s)?(clickFamilyStatus==='ready'?'Click-family aggregation in PHOIBLE 2.0.1':clickFamilyStatus==='loading'?'Loading PHOIBLE click-family aggregation…':`Click-family data unavailable${clickFamilyError?': '+clickFamilyError:''}`):'Exact symbol attestation in PHOIBLE sources';
  configureSymbolAudio(s);
  const pending=CLICK_SYMBOLS.has(s)&&clickFamilyStatus!=='ready';
  document.getElementById('dcount').textContent=pending?(clickFamilyStatus==='loading'?'…':'—'):ps.languageCount;
  document.getElementById('dpct').textContent=pending?'—':ps.languagePct.toLocaleString('en-US',{maximumFractionDigits:1})+'%';
  document.getElementById('dpeople').textContent=pending?'—':formatPeople(ps.total);
  document.getElementById('dweight').textContent=pending?'—':ps.pct.toLocaleString('en-US',{maximumFractionDigits:1})+'%';
  document.getElementById('ddoculects').textContent=pending?'—':ps.doculectCount;
  updateQualityIndicators(ps,pending);
  current=pending?[]:ps.languages;currentAuditFilter='all';lsearch.value='';document.getElementById('auditExplanation').textContent=CLICK_SYMBOLS.has(s)?'L aggregates complete PHOIBLE click segments by anterior click component. P includes only green verified mappings and amber verified realizations; blue source attestations remain excluded.':'L includes every source-attested language. P includes only green verified mappings and amber verified realizations; blue unresolved source attestations remain excluded.';updateAuditSummary(ps,pending);setAuditFilter('all');drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');drawer.scrollTop=0;
};

auditFilters.addEventListener('click',event=>{const button=event.target.closest('[data-audit-filter]');if(button)setAuditFilter(button.dataset.auditFilter,true);});
document.getElementById('statLanguages').addEventListener('click',()=>setAuditFilter('all',true));
document.getElementById('statPopulation').addEventListener('click',()=>setAuditFilter('included',true));

/* Keep comparison options synchronized after asynchronous click-family loading. */
const originalRefreshClickButtons=refreshClickButtons;
refreshClickButtons=function(status){originalRefreshClickButtons(status);if(comparisonLanguage)renderComparisonHighlight();else if(selectedLanguage)renderSingleLanguageHighlight(selectedLanguage);};
enableComparisonControls(Boolean(selectedLanguage));

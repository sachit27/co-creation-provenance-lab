/** Replay saved synthetic analysis through real HTTP endpoints; no provider calls. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { buildReviewQueue } from '../services/auditReview.ts';
import type { AnalysisResult } from '../types.ts';
const origin='http://127.0.0.1:5173';
const contextFile='tmp/demo-live-acceptance.private.json';
const request=async (path:string,method='GET',body?:unknown,headers:Record<string,string>={})=>{
 const response=await fetch(origin+path,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json(); if(!response.ok) throw new Error(`${response.status}: ${data.error}`); return data;
};
const baseline:AnalysisResult=JSON.parse(await readFile('tmp/demo-result.candidate.json','utf8'));
const remap=(record:AnalysisResult)=>{
 const ids=new Map(baseline.participants.map((p,i)=>[p.id,`P${String(i+1).padStart(3,'0')}`]));
 const walk=(value:any):any=> typeof value==='string' ? ids.get(value)??value : Array.isArray(value) ? value.map(walk) : value&&typeof value==='object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[ids.get(k)??k,walk(v)])) : value;
 const result=walk(record) as AnalysisResult;
 result.config.datasetName+=' · synthetic live replay'; result.reviewDecisions=[];
 return result;
};
const payload=(record:AnalysisResult,revision:number)=>{
 const p=record.participants;
 const sizes=new Map<number,number>(); p.forEach(p=>sizes.set(p.clusterId,(sizes.get(p.clusterId)??0)+1));
 const themes=record.clusters.map(c=>({clusterId:c.id,label:c.label,size:sizes.get(c.id)??0})).filter(t=>t.size);
 return {summary:record.summary,method:'Saved synthetic analysis replay · openai alignment',sourceRevision:revision,
 averageAlignment:p.reduce((s,p)=>s+p.representationScore,0)/p.length,gini:record.metrics.giniCoefficient,validCount:p.length,
 scores:Object.fromEntries(p.map(p=>[p.id,p.representationScore])),matches:Object.fromEntries(p.map(p=>[p.id,record.summarySentences[p.topSentenceMatchIndex]??null])),
 themes,participantThemes:Object.fromEntries(p.map(p=>[p.id,themes.find(t=>t.clusterId===p.clusterId)])),
 constellation:{projection:'pca-2d',nodes:p.map(p=>({submissionId:p.id,...p.semanticCoords,alignment:p.representationScore,comparable:true,clusterId:p.clusterId,matchSentenceIndex:p.topSentenceMatchIndex})),similarityLinks:(record.networkGraph?.edges??[]).map(e=>({sourceId:e.source,targetId:e.target,similarity:e.weight})),summarySentences:record.summarySentences,groupingUsable:record.clusteringDiagnostics?.usableForDownstream===true},
 analysisRecord:record};
};
if(process.argv[2] === 'export') {
 const context=JSON.parse(await readFile(contextFile,'utf8'));
 const exported=await request(`/api/live/sessions/${context.code}/export`,'GET',undefined,{Authorization:`Bearer ${context.hostToken}`});
 const serialized=JSON.stringify(exported);
 assert(serialized.includes('Synthetic browser check: this model suggestion remains unresolved.'));
 assert(!serialized.includes(context.hostToken));assert(!context.tokens.some((token:string)=>serialized.includes(token)));
 await writeFile('tmp/demo-live-acceptance-export.json',JSON.stringify(exported,null,2)+'\n');
 console.log(JSON.stringify({phase:'export-after-browser-review',publications:exported.publications.length,latestReviewHistory:exported.publications.at(-1).reviewHistory.length,browserNoteIncluded:true,noAccessTokens:true}));
} else if(process.argv[2] !== 'revision') {
 const created=await request('/api/live/sessions','POST',{title:'Synthetic demo validation',prompt:'Compare proposals for urban nature, access, flood resilience, and stewardship. This session replays synthetic test data.'});
 const path=`/api/live/sessions/${created.code}`;
 const host={Authorization:`Bearer ${created.hostToken}`};
 await request(path+'/status','POST',{status:'open'},host);
 const tokens:string[]=[];
 for(const p of baseline.participants){const joined=await request(path+'/join','POST');tokens.push(joined.participantToken);await request(path+'/submission','PUT',{text:p.originalText},{'X-Participant-Token':joined.participantToken});}
 const closed=await request(path+'/status','POST',{status:'closed'},host);
 const record=remap(baseline);
 let view=await request(path+'/publish','POST',payload(record,closed.revision),host);
 const issue=buildReviewQueue(record)[0];assert(issue);
 view=await request(path+'/review','PUT',{versionId:view.result.versionId,publishedAt:view.result.publishedAt,reviewRevision:0,decisions:[{issueId:issue.id,status:'unresolved',note:'Synthetic acceptance note: inspect this suggestion; no human judgment is claimed.'}]},host);
 const publicView=await request(path);assert(!publicView.result.analysisRecord);assert(!publicView.result.survey?.enabled);
 const own=await request(path,'GET',undefined,{'X-Participant-Token':tokens[0]});assert(own.result.ownAlignment!==undefined);assert(!own.submissions);
 await writeFile(contextFile,JSON.stringify({code:created.code,hostToken:created.hostToken,tokens},null,2),{mode:0o600});
 console.log(JSON.stringify({phase:'baseline',code:created.code,contributors:tokens.length,publication:view.result.versionId,privateNotesSaved:true,surveyHiddenByDefault:true}));
} else {
 const context=JSON.parse(await readFile(contextFile,'utf8'));
 const path=`/api/live/sessions/${context.code}`;const host={Authorization:`Bearer ${context.hostToken}`};
 let view=await request(path,'GET',undefined,host);
 const revised:AnalysisResult=remap(JSON.parse(await readFile('tmp/demo-revision.candidate.json','utf8')));
 view=await request(path+'/publish','POST',payload(revised,view.revision),host);
 assert.equal(view.result.versionId,'summary-v2');assert(view.result.previousAnalysisRecord);assert(!view.result.analysisRecord.reviewDecisions.length);
 const items=[...view.survey.definition.items,{id:'next_session',prompt:'Would you take part in another session using this process?',anchors:['Definitely not','Probably not','Unsure','Probably','Definitely'],origin:'custom',construct:'facilitator-defined-unspecified'}];
 await request(path+'/survey','PUT',{enabled:true,items},host);
 const response=Object.fromEntries(items.map((item:any)=>[item.id,item.id==='meaning'?'cannot_judge':4]));
 await request(path+'/feedback','PUT',{responses:response,comment:'Synthetic feedback for acceptance testing.',auditExposureBeforeResponse:'summary_only'},{'X-Participant-Token':context.tokens[0]});
 const exported=await request(path+'/export','GET',undefined,host);assert.equal(exported.publications.length,2);assert.equal(exported.participants.length,40);assert.equal(exported.participantFeedback.length,1);assert(exported.publications[0].reviewHistory.length>=2);
 const serialized=JSON.stringify(exported);assert(!serialized.includes(context.hostToken));assert(!context.tokens.some((token:string)=>serialized.includes(token)));
 await writeFile('tmp/demo-live-acceptance-export.json',JSON.stringify(exported,null,2)+'\n');
 console.log(JSON.stringify({phase:'revision',code:context.code,contributors:40,publications:2,feedback:1,reviewHistoryPreserved:true,exportHasNoAccessTokens:true}));
}

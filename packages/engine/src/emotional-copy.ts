/** Presentation only: old stored messages remain intact. Raw Meta replies are
 * also retained in provider receipts before this bounded intake presentation. */
export function emotionalIntakeText(kind:string,content:string){
  if(kind==='proposal')return 'A short illustrated mystery in one place, shaped by your preferences. Read at your pace and make three timed choices. The exact story is still to be created. Shall we prepare it?';
  const text=content.trim();
  if(kind==='question'&&!text.includes('?')&&/(?:^|[.!]\s+)(?:Would|What|Which|How|Do|Does|Is|Are|Shall|Should|Could|Can|Have|Has|Will)\b[^!?]*\.?$/iu.test(text))return text.replace(/\.$/u,'')+'?';
  return content;
}

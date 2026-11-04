export function paginateStory(paragraphs:string[],maxWords=72):string[][] {
  if(!Number.isInteger(maxWords)||maxWords<1)throw new Error('Invalid page size');
  const pages:string[][]=[];let page:string[]=[],size=0;
  for(const text of paragraphs){
    const words=text.trim().split(/\s+/).filter(Boolean);if(!words.length)continue;
    for(let index=0;index<words.length;index+=maxWords){
      const part=words.slice(index,index+maxWords);
      if(size+part.length>maxWords){pages.push(page);page=[];size=0;}
      page.push(part.join(' '));size+=part.length;
    }
  }
  if(page.length)pages.push(page);return pages;
}

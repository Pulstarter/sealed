const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export const containsIdentity=(text:string,name:string)=>new RegExp('(?:^|[^\\p{L}])'+escape(name)+'(?![\\p{L}])','iu').test(text);

/** A first name cannot also be another actor's surname or given name. */
export function firstNameIsUnambiguous(name:string,identities:readonly string[]){
 const first=name.split(' ')[0]!;
 return !identities.some(other=>other!==name&&containsIdentity(other,first));
}

export function replaceIdentityReference(text:string,name:string,identities:readonly string[],replacement:string){
 const aliases=firstNameIsUnambiguous(name,identities)?[name,name.split(' ')[0]!]:[name];
 for(const alias of [...new Set(aliases)].sort((a,b)=>b.length-a.length))text=text.replace(new RegExp('(^|[^\\p{L}])'+escape(alias)+'(?![\\p{L}])','gu'),(_match,prefix:string)=>prefix+replacement);
 return text;
}

/** Validation copy only: a correctly cased canonical label is not a room noun. */
export function maskCanonicalLabels(text:string,labels:readonly string[]){
 for(const label of [...new Set(labels)].sort((a,b)=>b.length-a.length))if(label&&!/^(?:the\s+)?(?:benches|bench|seats?|seating|chairs?)$/iu.test(label.trim()))text=text.replace(new RegExp('(^|[^\\p{L}])'+escape(label)+'(?![\\p{L}])','gu'),(_match,prefix:string)=>prefix+'[known label]');
 return text;
}

export async function readReportRows<T>(page:(from:number,to:number)=>PromiseLike<{data:unknown[]|null;error:unknown}>):Promise<T[]> {
 const rows:T[]=[]
 for(let offset=0;offset<=50000;offset+=1000){
  const {data,error}=await page(offset,offset+999)
  if(error) throw new Error('Не удалось прочитать события')
  rows.push(...(data||[]) as T[])
  if(rows.length>50000) throw new Error('Слишком много событий. Выберите меньший период')
  if((data?.length||0)<1000)return rows
 }
 throw new Error('Выберите меньший период')
}

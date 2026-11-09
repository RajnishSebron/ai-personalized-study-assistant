import {createClient} from "@supabase/supabase-js";
async function main(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,email=process.env.DEMO_EMAIL,password=process.env.DEMO_PASSWORD;
 if(!url||!key||!email||!password)throw new Error("Set Supabase URL, service role key, DEMO_EMAIL and DEMO_PASSWORD in .env.local.");
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:existing}=await admin.auth.admin.listUsers({page:1,perPage:1000});const match=existing.users.find(u=>u.email?.toLowerCase()===email.toLowerCase());
 if(match){const {error}=await admin.auth.admin.updateUserById(match.id,{password,email_confirm:true,user_metadata:{full_name:process.env.DEMO_NAME||"Demo Student"}});if(error)throw error;console.log(`Updated demo user: ${email}`);return;}
 const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:process.env.DEMO_NAME||"Demo Student"}});if(error)throw error;console.log(`Created demo user: ${data.user.email}`);
}
main().catch(e=>{console.error(e);process.exit(1)});

import {NextResponse} from "next/server";
import crypto from 'crypto';
import https from 'https';
import axios from 'axios';

const allowLegacyRenegotiationOptions = {
    httpsAgent: new https.Agent({
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    }),
    headers: {
        Authorization: 'Bearer bfa9b6c0-3f4f-3b1f-92c4-1bdd885a1ca2',
    },
};

async function fetchCourseInfo(code:string){
    const response=await axios.get('https://api.data.um.edu.mo/service/academic/course_catalog/v1.0.0/all?course_code='+code.toUpperCase(), allowLegacyRenegotiationOptions)
    const data=await response.data
    //console.log(data)
    return data['_embedded'][0]
}

export async function GET(req:any){
    const {searchParams} = new URL(req.url);
    const code:any = searchParams.get("code");
    const data = await fetchCourseInfo(code)
    return new NextResponse(JSON.stringify(data))
}
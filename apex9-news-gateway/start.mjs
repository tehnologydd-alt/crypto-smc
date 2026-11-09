import {startLocalGateway} from './news-gateway.mjs';
startLocalGateway({proxyOrigin:process.env.APEX_PROXY_ORIGIN||null});
console.log('APEX local news gateway listening on 127.0.0.1:8787');

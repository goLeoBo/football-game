// data.js — 纯数据（原单文件中的常量，React 组件与引擎共用）

export const FORMATIONS = {
  '4-3-3': [
    [100, 280, 'GK'],
    [240, 110, 'DEF'], [240, 220, 'DEF'], [240, 340, 'DEF'], [240, 450, 'DEF'],
    [410, 160, 'MID'], [410, 280, 'MID'], [410, 400, 'MID'],
    [420, 190, 'FWD'], [420, 280, 'FWD'], [420, 370, 'FWD']
  ],
  '4-4-2': [
    [100, 280, 'GK'],
    [240, 110, 'DEF'], [240, 220, 'DEF'], [240, 340, 'DEF'], [240, 450, 'DEF'],
    [400, 130, 'MID'], [400, 250, 'MID'], [400, 310, 'MID'], [400, 430, 'MID'],
    [420, 230, 'FWD'], [420, 330, 'FWD']
  ],
  '3-5-2': [
    [100, 280, 'GK'],
    [230, 180, 'DEF'], [230, 280, 'DEF'], [230, 380, 'DEF'],
    [380, 110, 'MID'], [380, 215, 'MID'], [380, 280, 'MID'], [380, 345, 'MID'], [380, 450, 'MID'],
    [420, 230, 'FWD'], [420, 330, 'FWD']
  ]
};

export const RED_POOL = { GK:['阿利松','埃德森'], DEF:['阿诺德','范戴克','拉莫斯','马塞洛','戴维斯'], MID:['德布劳内','莫德里奇','坎特','贝林厄姆','罗德里'], FWD:['姆巴佩','哈兰德','梅西'] };

export const BLUE_POOL = { GK:['诺伊尔','卡西利亚斯'], DEF:['卡福','马尔蒂尼','特里','卡洛斯','拉姆'], MID:['哈维','伊涅斯塔','齐达内','皮尔洛','马特乌斯'], FWD:['C罗','罗纳尔多','罗纳尔迪尼奥'] };

export const CLUBS = [
  {name:'皇家马德里', GK:['库尔图瓦','纳瓦斯'], DEF:['卡瓦哈尔','米利唐','拉莫斯','马塞洛','门迪'], MID:['克罗斯','莫德里奇','卡塞米罗','巴尔韦德','贝林厄姆'], FWD:['维尼修斯','本泽马','姆巴佩','罗德里戈']},
  {name:'巴塞罗那', GK:['特尔施特根'], DEF:['阿尔维斯','皮克','阿劳霍','阿尔巴','巴尔德'], MID:['哈维','伊涅斯塔','布斯克茨','德容','佩德里'], FWD:['梅西','苏亚雷斯','亚马尔','登贝莱']},
  {name:'拜仁慕尼黑', GK:['诺伊尔'], DEF:['基米希','博阿滕','于帕梅卡诺','阿方索·戴维斯','帕瓦尔'], MID:['穆勒','戈雷茨卡','萨内','穆西亚拉','蒂亚戈'], FWD:['莱万多夫斯基','格纳布里','科曼','马内']},
  {name:'利物浦', GK:['阿利松'], DEF:['阿诺德','范戴克','科纳特','罗伯逊','马蒂普'], MID:['亨德森','法比尼奥','蒂亚戈','麦卡利斯特','索博斯洛伊'], FWD:['萨拉赫','马内','菲尔米诺','努涅斯']},
  {name:'曼城', GK:['埃德森'], DEF:['沃克','鲁本·迪亚斯','斯通斯','坎塞洛','阿克'], MID:['德布劳内','罗德里','B席','京多安','福登'], FWD:['哈兰德','斯特林','格拉利什','阿尔瓦雷斯']},
  {name:'巴黎圣日耳曼', GK:['多纳鲁马'], DEF:['哈基米','马尔基尼奥斯','金彭贝','门德斯','贝尔纳特'], MID:['维拉蒂','维蒂尼亚','法比安','埃基蒂克','索莱尔'], FWD:['姆巴佩','内马尔','梅西','迪马利亚']},
  {name:'尤文图斯', GK:['布冯'], DEF:['德利赫特','基耶利尼','博努奇','桑德罗','达尼洛'], MID:['皮亚尼奇','本坦库尔','拉比奥','洛卡特利','麦肯尼'], FWD:['C罗','迪巴拉','弗拉霍维奇','基耶萨']},
  {name:'AC米兰', GK:['迈尼昂'], DEF:['卡卢卢','托莫里','罗马尼奥利','特奥','卡拉布里亚'], MID:['托纳利','本纳塞尔','凯西','迪亚斯','克鲁尼奇'], FWD:['伊布拉希莫维奇','吉鲁','雷比奇','莱奥']},
  {name:'国际米兰', GK:['汉达诺维奇'], DEF:['什克里尼亚尔','德弗里','巴斯托尼','邓弗里斯','迪马尔科'], MID:['布罗佐维奇','巴雷拉','恰尔汗奥卢','姆希塔良','泽林斯基'], FWD:['卢卡库','劳塔罗','哲科','科雷亚']},
  {name:'阿森纳', GK:['拉亚'], DEF:['本怀特','萨利巴','加布里埃尔','津琴科','富安健洋'], MID:['厄德高','托马斯','赖斯','史密斯罗','维埃拉'], FWD:['萨卡','热苏斯','马丁内利','特罗萨德']}
];

export const PM_CLUBS = [
  {name:'国际米兰',short:'国米',bg:'linear-gradient(135deg,#0068a8,#001a33)',dark:false},
  {name:'皇家马德里',short:'皇马',bg:'linear-gradient(135deg,#ffffff,#e8e8e8)',dark:true},
  {name:'巴塞罗那',short:'巴萨',bg:'linear-gradient(135deg,#004d98,#a50044)',dark:false},
  {name:'拜仁慕尼黑',short:'拜仁',bg:'linear-gradient(135deg,#dc052d,#7a0016)',dark:false},
  {name:'利物浦',short:'红军',bg:'linear-gradient(135deg,#c8102e,#6e0018)',dark:false},
  {name:'曼城',short:'曼城',bg:'linear-gradient(135deg,#6cabdd,#1c2c5b)',dark:false},
  {name:'巴黎圣日耳曼',short:'巴黎',bg:'linear-gradient(135deg,#004170,#a50044)',dark:false},
  {name:'尤文图斯',short:'尤文',bg:'linear-gradient(135deg,#111111,#4a4a4a)',dark:false},
  {name:'AC米兰',short:'米兰',bg:'linear-gradient(135deg,#fb090b,#000000)',dark:false},
  {name:'阿森纳',short:'枪手',bg:'linear-gradient(135deg,#ef0107,#7c0010)',dark:false}
];

export const PM_FORMATIONS = {
  '4-3-3':{fwd:[20,50,80],mid:[20,50,80],def:[12,38,62,88]},
  '4-4-2':{fwd:[35,65],mid:[12,38,62,88],def:[12,38,62,88]},
  '3-5-2':{fwd:[35,65],mid:[12,30,50,70,88],def:[25,50,75]}
};

export const NATIONAL_TEAMS = [
  // 第1档（种子）
  {name:'巴西',rating:92,pot:1},{name:'阿根廷',rating:91,pot:1},{name:'法国',rating:90,pot:1},
  {name:'英格兰',rating:88,pot:1},{name:'西班牙',rating:88,pot:1},{name:'葡萄牙',rating:87,pot:1},
  {name:'德国',rating:86,pot:1},{name:'意大利',rating:86,pot:1},{name:'荷兰',rating:85,pot:1},
  {name:'比利时',rating:85,pot:1},{name:'克罗地亚',rating:85,pot:1},{name:'墨西哥',rating:84,pot:1},
  // 第2档
  {name:'乌拉圭',rating:83,pot:2},{name:'哥伦比亚',rating:83,pot:2},{name:'美国',rating:82,pot:2},
  {name:'瑞士',rating:81,pot:2},{name:'日本',rating:81,pot:2},{name:'摩洛哥',rating:81,pot:2},
  {name:'丹麦',rating:80,pot:2},{name:'塞内加尔',rating:80,pot:2},{name:'塞尔维亚',rating:80,pot:2},
  {name:'瑞典',rating:79,pot:2},{name:'波兰',rating:79,pot:2},{name:'威尔士',rating:78,pot:2},
  // 第3档
  {name:'韩国',rating:76,pot:3},{name:'土耳其',rating:76,pot:3},{name:'伊朗',rating:75,pot:3},
  {name:'智利',rating:75,pot:3},{name:'厄瓜多尔',rating:74,pot:3},{name:'乌克兰',rating:74,pot:3},
  {name:'尼日利亚',rating:74,pot:3},{name:'秘鲁',rating:73,pot:3},{name:'奥地利',rating:73,pot:3},
  {name:'捷克',rating:73,pot:3},{name:'巴拉圭',rating:72,pot:3},{name:'喀麦隆',rating:72,pot:3},
  // 第4档
  {name:'埃及',rating:71,pot:4},{name:'加拿大',rating:70,pot:4},{name:'突尼斯',rating:70,pot:4},
  {name:'阿尔及利亚',rating:70,pot:4},{name:'科特迪瓦',rating:70,pot:4},{name:'哥斯达黎加',rating:69,pot:4},
  {name:'澳大利亚',rating:68,pot:4},{name:'沙特阿拉伯',rating:67,pot:4},{name:'南非',rating:67,pot:4},
  {name:'卡塔尔',rating:66,pot:4},{name:'牙买加',rating:66,pot:4},{name:'洪都拉斯',rating:65,pot:4}
];

export const NT_STARS = {
  '巴西':{GK:['阿利松'],DEF:['达尼洛','马尔基尼奥斯','蒂亚戈·席尔瓦','阿莱士·桑德罗'],MID:['卡塞米罗','布鲁诺·吉马良斯','内马尔'],FWD:['维尼修斯','理查利森','拉菲尼亚']},
  '阿根廷':{GK:['马丁内斯'],DEF:['莫利纳','罗梅罗','奥塔门迪','塔利亚菲科'],MID:['德保罗','帕雷德斯','洛塞尔索'],FWD:['阿尔瓦雷斯','劳塔罗','梅西']},
  '法国':{GK:['迈尼昂'],DEF:['帕瓦尔','瓦拉内','于帕梅卡诺','埃尔南德斯'],MID:['琼阿梅尼','拉比奥','格列兹曼'],FWD:['姆巴佩','吉鲁','登贝莱']},
  '英格兰':{GK:['皮克福德'],DEF:['沃克','斯通斯','马奎尔','肖'],MID:['赖斯','贝林厄姆','萨卡'],FWD:['福登','凯恩','斯特林']},
  '西班牙':{GK:['西蒙'],DEF:['卡瓦哈尔','托雷斯','拉波尔特','阿尔巴'],MID:['罗德里','佩德里','加维'],FWD:['阿森西奥','莫拉塔','费兰']},
  '葡萄牙':{GK:['科斯塔'],DEF:['坎塞洛','迪亚斯','佩佩','格雷罗'],MID:['帕利尼亚','B席','B费'],FWD:['莱奥','C罗','菲利克斯']},
  '德国':{GK:['诺伊尔'],DEF:['基米希','吕迪格','聚勒','劳姆'],MID:['京多安','穆西亚拉','萨内'],FWD:['格纳布里','维尔纳','穆勒']},
  '意大利':{GK:['多纳鲁马'],DEF:['迪洛伦佐','阿切尔比','巴斯托尼','迪马尔科'],MID:['巴雷拉','若日尼奥','维拉蒂'],FWD:['因西涅','因莫比莱','基耶萨']},
  '荷兰':{GK:['比杰洛'],DEF:['弗林蓬','德利赫特','范戴克','阿克'],MID:['德容','克拉森','加克波'],FWD:['德佩','马伦','贝尔赫伊斯']},
  '比利时':{GK:['库尔图瓦'],DEF:['卡斯塔涅','阿尔德韦雷尔德','维尔通亨','梅尼耶'],MID:['维特塞尔','德布劳内','阿扎尔'],FWD:['特罗萨德','卢卡库','默滕斯']},
  '克罗地亚':{GK:['利瓦科维奇'],DEF:['尤拉诺维奇','洛夫伦','格瓦迪奥尔','索萨'],MID:['布罗佐维奇','科瓦契奇','莫德里奇'],FWD:['佩里西奇','克拉马里奇','帕沙利奇']},
  '墨西哥':{GK:['奥乔亚'],DEF:['阿劳霍','蒙特斯','加亚多','桑切斯'],MID:['阿尔瓦雷斯','埃雷拉','查韦斯'],FWD:['安图尼亚','希梅内斯','洛萨诺']}
};

export const NT_FLAG = {
  '巴西':'br','阿根廷':'ar','法国':'fr','英格兰':'gb-eng','西班牙':'es','葡萄牙':'pt',
  '德国':'de','意大利':'it','荷兰':'nl','比利时':'be','克罗地亚':'hr','墨西哥':'mx',
  '乌拉圭':'uy','哥伦比亚':'co','美国':'us','瑞士':'ch','日本':'jp','摩洛哥':'ma',
  '丹麦':'dk','塞内加尔':'sn','塞尔维亚':'rs','瑞典':'se','波兰':'pl','威尔士':'gb-wls',
  '韩国':'kr','土耳其':'tr','伊朗':'ir','智利':'cl','厄瓜多尔':'ec','乌克兰':'ua',
  '尼日利亚':'ng','秘鲁':'pe','奥地利':'at','捷克':'cz','巴拉圭':'py','喀麦隆':'cm',
  '埃及':'eg','加拿大':'ca','突尼斯':'tn','阿尔及利亚':'dz','科特迪瓦':'ci','哥斯达黎加':'cr',
  '澳大利亚':'au','沙特阿拉伯':'sa','南非':'za','卡塔尔':'qa','牙买加':'jm','洪都拉斯':'hn'
};

export const CLUB_LOGO_BASE = 'https://cdn.jsdelivr.net/gh/luukhopman/football-logos@master/logos/';

export const CLUB_LOGO = {
  '皇家马德里': 'Spain - LaLiga/Real Madrid.png',
  '巴塞罗那': 'Spain - LaLiga/FC Barcelona.png',
  '拜仁慕尼黑': 'Germany - Bundesliga/Bayern Munich.png',
  '利物浦': 'England - Premier League/Liverpool FC.png',
  '曼城': 'England - Premier League/Manchester City.png',
  '巴黎圣日耳曼': 'France - Ligue 1/Paris Saint-Germain.png',
  '尤文图斯': 'Italy - Serie A/Juventus FC.png',
  'AC米兰': 'Italy - Serie A/AC Milan.png',
  '国际米兰': 'Italy - Serie A/Inter Milan.png',
  '阿森纳': 'England - Premier League/Arsenal FC.png'
};

export const FLAG_BASE = 'https://flagcdn.com/';

export const AVATAR_COLORS = ['#0068a8','#a50044','#c8102e','#6cabdd','#dc052d','#1c2c5b','#007a5e','#8a5a00','#5b2d8e','#0a7a8a'];


const {PrismaClient} = require("@prisma/client");
const db = new PrismaClient({log:["error"]});
db.voiceVariation.findFirst({where:{refAudioServerUrl:{not:""}}}).then(v=>{
  console.log("URL:", v.refAudioServerUrl);
  console.log("Path:", v.refAudioPath);
  db.$disconnect();
});

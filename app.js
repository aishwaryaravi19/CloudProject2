var express = require('express');
const expressLayouts=require('express-ejs-layouts');
var app = express();
var uuid = require('uuid');
var bodyParser=require("body-parser")
var path=require("path")
const AmazonCognitoIdentity = require('amazon-cognito-identity-js');
const CognitoUserPool = AmazonCognitoIdentity.CognitoUserPool;
const AWS = require('aws-sdk');
const request = require('request');
const jwkToPem = require('jwk-to-pem');
const jwt = require('jsonwebtoken');
const insertUtility=require("./utilities/doctor")
let users=require("./routes/users");
const { use } = require('./routes/users');
const decodeJwt=require("jwt-decode")
const formtopdf = require('./utilities/formtopdf')
const fs=require("fs")
var PDFDocument = require('pdfkit');
const { Console } = require('console');
let email=require("./routes/emailnotifier");

require("dotenv").config();
AWS.config.update({
  accessKeyId: process.env["ACCESS_KEY_ID"],
  secretAccessKey: process.env["SECRET_ACCESS_KEY"],
  region: process.env["AWS_REGION"] 
});

var scheduleHandler = require("./routes/medSchedule");

//app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(express.json())
app.use(expressLayouts);
//app.use(express.bof)
app.set('view engine','ejs')
//app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'views')));
const poolData = {    
  UserPoolId : "us-west-1_x1klxacrm", // Your user pool id here    
  ClientId : "5nbvps4hlmh0a66mb4k771ns6f" // Your client id here
  }; 
  const pool_region = 'us-east-1';
  const pool=new AmazonCognitoIdentity.CognitoUserPool(poolData)

  
  // about page
app.use("/medSchedule",scheduleHandler);

module.exports = app;

app.use("/",users);
  app.listen(3000);
  console.log('Server is listening on port 3000');

app.get('/dashboard',function(req,res){
    res.render("dashboard")
})

app.get('/prescription',function(req,res){
  res.render("prescription")
})

app.get('/addprescription',function(req,res){
  console.log(formtopdf)
  res.render("addprescription", {
    utils: formtopdf,
    email: req.query.email
  })
})



  app.get ("/welcome", function (req,res) {
    res.render ( "welcome.ejs" );	
    } )

  app.get("/medSchedule", function (req,res) {
    console.log("process",  process.env["DYNAMODB_TABLE_PRESCRIPTION"]);		
        })

  app.get ("/schedule", function (req,res) {
    res.render ( "schedule.ejs" );	
    } )
  


    //register
  app.post("/register",function(req,res){
      const { name, email, password, confirm,userType,dob,address} = req.body;
         console.log("name",name,email,confirm,password,userType,typeof(userType))
      var attributeList = [];
       attributeList.push(new AmazonCognitoIdentity.CognitoUserAttribute({Name:"name",Value:name}));
       attributeList.push(new AmazonCognitoIdentity.CognitoUserAttribute({Name:"gender",Value:"female"}));
        attributeList.push(new AmazonCognitoIdentity.CognitoUserAttribute({Name:"email",Value:email}));
        attributeList.push(new AmazonCognitoIdentity.CognitoUserAttribute({Name:"custom:userType",Value:userType}))
  pool.signUp(email,password,attributeList,null,function(err,result){
    if (err) {
      console.log("error",err);
      if(err=="UsernameExistsException: An account with the given email already exists."){
        res.status(403).send({message:"User exists already"})
      }
      else{
      res.status(500).send({message:"Internal error"})
      }
      //return;
  }
  else{
  console.log("Result",result)
  cognitoUser = result.user;
  console.log('user name is ' + cognitoUser.getUsername());
  
  res.status(200).send({message:"Success"})
  verifyEmail(email)
  insertUserToDb(req,res);
  
  }
  
  
  //insertUtility.insertDocToDb("req","res")


  function insertUserToDb(req,res) {

      const db = new AWS.DynamoDB();
      const dbInput = {
          TableName: process.env["DYNAMODB_TABLE_USER"],
             Item: {
               Name: { S: req.body.name },
               email: { S: req.body.email },
               userType: { S: req.body.userType },
               gender: {S: req.body.gender},
               dob: {S: req.body.dob},
               address: {S: req.body.address}
             },
           };
           db.putItem(dbInput, function (putErr, putRes) {
             if (putErr) {
               console.log("Failed to put item in dynamodb: ", putErr);
               res.status(404).json({
                 err: "Failed to Upload!",
               });
             } else {
               console.log("Successfully written to dynamodb", putRes);
             }
           });
          }
 });
});


//verify
app.post('/verifyuser',function(req,res){
  console.log("res into verify",req.body)
  const otp=req.body.otp
 const userData={
   Username:req.body.email,
   Pool:pool
 }
 const cognitoUser=new AmazonCognitoIdentity.CognitoUser(userData);
 cognitoUser.confirmRegistration(otp,true,function(error,results){
   if(error){
     console.log("error",error)
   }
   console.log("results from verify",results)
 })

})
//login
app.post("/login",async(req,res)=>{
  console.log("login",req.body)
 const authentication_details=new AmazonCognitoIdentity.AuthenticationDetails(
   {
    Username: req.body.email,
    Password: req.body.password
   }
 )
var userData = {
  Username : req.body.email,
  Pool : pool
};
var cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData)
cognitoUser.authenticateUser(authentication_details, {
  onSuccess: function (result) {
   
    var token = result.getIdToken().getJwtToken();
var decoded = decodeJwt(token);

res.send({message:"Success",token:result.getIdToken().getJwtToken(),data:decoded})
//res.redirect("/dashboard")
  },
  onFailure: function(err) {
      console.log("error in onfailure",err);
      if(err=="NotAuthorizedException: Incorrect username or password."){
        res.status(404).send({message:"User does not exist"})
      }
      else{
        if(err=="UserNotConfirmedException: User is not confirmed."){
          res.status(200).json({message:"User not confirmed"})
        }
      res.status(200).json({message:"Incorrect Password"})
      }
      //res.sendStatus(500).send({"message":"Internal error"})
  },

});
});

app.get("/dashboardview",async(req,res)=>{
  console.log("Request query",req.query)
 if(req.query.userType=="Doctor"){
   console.log("doctoe")
  const response= await getPatients()
  const results=response.Items
  console.log("results",results)
  res.render("dashboard",{data:results,userName:req.query.userName})

 }
 else{
  res.render("dashboard",{data:[],userName:req.query.userName})
 }
})

app.get("/prescriptionview",async(req,res)=>{
  console.log("Prescription Request query",req.query)
  const response= await getPatientPrescriptions(req.query.email)
  const results=response.Items
  console.log("prescription view",results)
  res.render("prescription",{data:results, email: req.query.email})

 })
 
function getPatientPrescriptions(req){
  console.log("patient email", req );
  return new Promise((resolve,reject)=>{

  const db = new AWS.DynamoDB();
   let scanningParam={
     //KeyConditionExpression: 'patientEmail =: patientEmail',
     //ExpressionAttributeNames: {"#PE": "patientEmail"},
     ExpressionAttributeValues: {":u": {S: req},},
     FilterExpression: "patientEmail = :u",
     //ProjectionExpression : "#PE",
     TableName:process.env["DYNAMODB_TABLE_PRESCRIPTION"], 
   }
    db.scan(scanningParam,function(err,data){
     if(err){
       console.log("err",err)
       reject(err)
     }
     else{
       //console.log("data",data)
       resolve(data)
     }
   })
  })
}

function getPatients(req,res) {
  console.log("getpatient function")
  return new Promise((resolve,reject)=>{

  const db = new AWS.DynamoDB();
 let scanningParam={
   TableName:process.env["DYNAMODB_TABLE_USER"],
   
 }
  db.scan(scanningParam,function(err,data){
   if(err){
     console.log("err",err)
     reject(err)
   }
   else{
     //console.log("data",data)
     resolve(data)
   }
 })
})
}
app.post("/pdf",async(req,res)=>{
  const s3=new AWS.S3();
  console.log("req,para",req.body)
 const response= await formtopdf.createpdf(req.body);
 console.log("Res",response)
 //PDFDocument.pipe(fs.createWriteStream(response));
//PDFDocument.end();
 
  fs.readFile(response, function (err, data) {
    if (err) {
      console.log(err);
    }
    s3.upload({
      Bucket: "prescriptionmanager",
      Key: response,
      Body: data,
      ContentType:'application/pdf',
      ACL:'public-read'
      
    }, function(err, dataD) {
      if (err) {
        console.log(err);
      }
      console.log("DATA FROM S3",dataD,req.body.email)
      sendEmail(req.body.email,req.body.name)

      //res.status(200).send({"message":"Success"})
      const db = new AWS.DynamoDB();
      const dbInput = {
            TableName: process.env["DYNAMODB_TABLE_PRESCRIPTION"],
            Item: {
              Id: { S: uuid.v1() },
              patientName: { S: req.body.name },
              prescriptionName: {S: req.body.prescription},
              medicine: {S: req.body.medicine},
              patientEmail: { S: req.body.email},
              startDate: { S: req.body.sdate },
              endDate: { S: req.body.edate },
              morningCount: { N: req.body.morning },
              middayCount: { N: req.body.midday },
              eveningCount: {N: req.body.evening},
              bedtimeCount: {N: req.body.bedtime},
              cloudfrontKey: { S: dataD.key },
            },
          };
          db.putItem(dbInput, function (putErr, putRes) {
            if (putErr) {
              console.log("Failed to put item in dynamodb: ", putErr);
              res.status(404).json({
                err: "Failed to Upload!",
              });
            } else {
              console.log("Successfully written to dynamodb", putRes);
              res.status(200).json({
                message: "Upload is successful!",
              });
            }
          });
    });
  });
})

function verifyEmail(mail){
  console.log("verufyemail function entered")
  var ses=new AWS.SES()
  var params = {
    EmailAddress: mail
 };
  
 ses.verifyEmailAddress(params, function(err, data) {
    if(err) {
      console.log("Err",err)
        //res.send(err);
    }
    else {
      console.log("data--->",data)
       
    }
  
 });
}
function sendEmail(email,name){



  var params = {
    Destination: { /* required */
      CcAddresses: [
        'medexforu@gmail.com',
        /* more items */
      ],
      ToAddresses: [
       email,
        /* more items */
      ]
    },
    Message: { /* required */
      Body: { /* required */
        Html: {
         Charset: "UTF-8",
         Data: '<div><center><img src="https://www.crushpixel.com/stock-photo/assorted-pharmaceutical-medicine-pills-tablets-1959484.html" alt="My Medication"  width="70" height="70"/></center><h3>Hello, '+name+'</h3><p>&nbsp;&nbsp;&nbsp;&nbsp;A new prescription has been added to you by your doctor.Login to the portal to view the details.</p><p>Regards,<br/><b>My Medication Team</b></p></div>'
        },
        Text: {
         Charset: "UTF-8",
         Data: `Dear ${name}, A new prescription has been added to you.Login to your application to view`
        }
       },
       Subject: {
        Charset: 'UTF-8',
        Data: 'Prescription Added.'
       }
      },
    Source: 'medexforu@gmail.com', /* required */
    ReplyToAddresses: [
       'medexforu@gmail.com',
      /* more items */
    ],
  };
  // Create the promise and SES service object
 var sendPromise = new AWS.SES({"accessKeyId":  process.env["ACCESS_KEY_ID"], "secretAccessKey":  process.env["SECRET_ACCESS_KEY"], "region": process.env["AWS_REGION"]}).sendEmail(params).promise();
  // Handle promise's fulfilled/rejected states
 sendPromise.then(
   function(data) {
     console.log("data-->",data.MessageId);
   }).catch(
     function(err) {
     console.error("errorr-->",err, err.stack);
   });

}

app.use('/delete',require('./routes/prescription-delete'));





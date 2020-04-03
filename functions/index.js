// Chatbot functions
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const dialogflow = require("dialogflow");
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const dotenv = require("dotenv");
dotenv.config()
const api_key = process.env.WHATSAPP_API_KEY;
const whatsapp_url = process.env.WHATSAPP_API_URL;
const projectId = process.env.PROJECT_ID
process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

// Dialogflow Agent
async function dialogflowQuery(msg){
    console.log("Dialogflow Message =>", JSON.stringify(msg));
    // Send a query to the dialogflow agent, and return the query result.
    // * @param {string} projectId for the Project to be Used
    // A unique identifier for the given session
    const sessionId = msg.from;
    // Create a new session
    const sessionClient = new dialogflow.v2.SessionsClient({
        // Optional Auth parameters.
    });
    const sessionPath = sessionClient.sessionPath(projectId, sessionId);
    const langCode = "en";
    // The text query request.
    const requestBody = {
        session: sessionPath,
        queryInput: {
            text: {
                // The query to send to the dialogflow agent
                text: msg.content,
                // The language used by the client (en-US)
                languageCode: langCode
            }
        }
    };
    // Send request and log results
    const responseBody = await sessionClient.detectIntent(requestBody);
    console.log("Detected intent");
    console.log("responseBody", requestBody);
    const result = responseBody[0].queryResult;
    console.log(`   Query: ${result.queryText}`);
    console.log(`   Response: ${result.fulfillmentText}`);
    if (result.intent){
        console.log(`   Intent: ${result.intent.displayName}`);
        // log response from dialogflow in the firestore with fulfillment cloud function
    } else {
        console.log(`   No Intent matched.`);
        // Handled by fallback Intent - An Intent must always to be matched
    }
    return Promise.resolve(result);
}

// Handle WhatsApp Replies => Standard text
async function replyUser(reply) {
    console.log("reply => Sending reply to user", JSON.stringify(reply))
    var xhr = new XMLHttpRequest(),
        body = JSON.stringify({
            "messages": [
                {
                    "channel": "whatsapp",
                    "to": reply.to,
                    "content": reply.content,
                    "previewFirstUrl": true
                }
            ]
        })
    xhr.open("POST", whatsapp_url, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", api_key);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200){
            console.log("success");
        }
    };
    xhr.send(body);
    console.log(`Message Sent Successfully to user ${reply.to} => content:`, JSON.stringify(reply.content));
    return ({"ReplyUser": "Message sent"})
}



exports.dialogflowFirebaseFulfillment = functions.https.onRequest(async (request, response) => {
    console.log("Dialogflow Request headers: " + JSON.stringify(request.headers));
    console.log("Dialogflow Request Body: " + JSON.stringify(request.body));
    try {
        // Retrieve messages based on whether it is text or image
        let message = ("moText" in request.body.event) ? request.body.event.moText[0]: request.event.moMedia[0];
        let content = ("moText" in request.body.event) ? request.body.event.moText[0].content: "Image Uploaded";
        console.log("Message Sent =>", content);
        let base64Img = ("moMedia" in request.body.event) ? request.body.event.moMedia[0].content : null;
        message.content = content
        console.log("Message Retrieved Successfully =>", JSON.stringify(message));

        let resp = await dialogflowQuery(message);

        let reply = {
            to: message.from,
            from: message.to,
            content: resp.fulfillmentText
        }


        return response.status(200).send(replyUser(reply));
        
    } catch (error) {
        console.log(error)
        
    }




});
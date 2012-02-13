/*
node arduino
 This sketch connects to a node.js sevice listening on a TCP port
 using an Arduino Wiznet Ethernet shield. Implenting a simple Ascii
 based potocol.
 Protocol:
 * o Pin Status :: digitalWrite(Pin, Status) // output from arduino
 * m Pin Mode :: pinMode( Pin, Mode) // 0:input 1:output
 * r Pin Enable :: analogRead(Pin) // 0:disable 1:enable
 * a Pin Reading :: if analog enabled (see "r") every 200ms
 * i Pin Status :: if digital input mode input (see "m") evey 200ms
 data is only send out when there are changes fom prior readings
 Circuit:
 * Ethernet shield attached to pins 10, 11, 12, 13
 created 11 Feb 2011
 by kiilo (Tobias Hoffmann)
 */

#include <SPI.h>
#include <Ethernet.h>
#include <TextFinder.h>

// Enter a MAC address for your controller below.
// Newer Ethernet shields have a MAC address printed on a sticker on the shield
byte mac[] = {
  0x00, 0xAA, 0xBB, 0xCC, 0xDA, 0x03 };
IPAddress server(192, 168, 42, 62);

// Initialize the Ethernet client library
// with the IP address and port of the server
// that you want to connect to (port 80 is default for HTTP):
EthernetClient client;
TextFinder finder(client, 1);

int Pin = 13;
int Mode = 1;
int Status;
int PinModes[] = {
  -1, -1, 1, 1, 1, 1, 1, 1, 1, 1}; // , 1, 1, 1, 1}; // 10 -13 allready used
int PinStatus[] = {
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1}; // , 0, 0, 0, 0}; // dito
int AnalogEnable[] = {
  0, 0, 0, 0, 0, 0};
int Analog;
int AnalogStatus[] = { 
  -1, -1, -1, -1, -1, -1}; // it will update on first reading

long PingTimer = 0;
long UpdateTimer = 0;
int UpdateInterval = 200;

// Initialize the Ethernet client library
// with the IP address and port of the server
// that you want to connect to (port 80 is default for HTTP):
//client.connect(server, 7000);



void setup() {
  // start the Ethernet connection:
  Ethernet.begin(mac);
  // start the serial library:
  Serial.begin(9600);
  // give the Ethernet shield a second to initialize:
  delay(1000);
  connectTCP();
  // if you get a connection, report back via serial:
}

void loop()
{
  // if there are incoming bytes available
  // from the server, read them and print them:

  // INCOMING MESSAGES //////////////////////////////////////////////////
  while (client.available()) {
    char c = client.read();
    Serial.print(c);

    if( c == 'o') { // o Pin PinStatus :: output pin
      Pin = finder.getValue();
      PinStatus[Pin] = finder.getValue();
      if (PinModes[Pin] > 0) {
        digitalWrite(Pin, PinStatus[Pin]);
      }
    }
    if( c == 'm') { // m Pin PinMode :: PinMode change pin mode
      Pin = finder.getValue();
      Mode = finder.getValue();
      PinModes[Pin] = Mode;
      pinMode(Pin, Mode);
    }
    if( c == 'r') { // r Pin AnalogEnable :: analog pin enable
      Pin = finder.getValue();
      AnalogEnable[Pin] = finder.getValue();
    }

  }

  // OUTGOING MESSAGES /////////////////////////////////////////////////
  if (UpdateTimer < millis()) {
    UpdateTimer = millis() + UpdateInterval;

    for(Pin = 2; Pin < 10; Pin++) {
      if(PinModes[Pin] == 0) {
        Status = digitalRead(Pin);
        if (Status != PinStatus[Pin]) {
          PinStatus[Pin] = Status;
          client.write("i ");
          client.print(Pin);
          client.write(" ");
          client.print(Status);
          client.write("\n");
        }
      }
    }

    for(Pin = 0; Pin < 6; Pin++) {
      if(AnalogEnable[Pin]) {
        Analog = analogRead(Pin);
        if (Analog != AnalogStatus[Pin]) {
          AnalogStatus[Pin] = Analog;
          client.write("a ");
          client.print(Pin);
          client.write(" ");
          client.print(Analog);
          client.write("\n");
        }
      }
    }
  }

  if (PingTimer < millis()) {
    PingTimer = millis() + 20000;
    client.write("p ");
    client.print(millis());
    client.write("\n");
  }

  // if the server's disconnected, try to reconnect:
  if (!client.connected()) {
    Serial.println();
    Serial.println("LOST connection try again");
    client.stop();
    delay(1000);
    Ethernet.begin(mac);
    delay(1000);
    connectTCP();
  }
  while (Serial.available()) {
    char c = Serial.read();
    client.print(c);
  }
}

void connectTCP() {
  Serial.println("connect");
  if (client.connect("kiilo.org", 7000)) {
    Serial.println("connected");
    // send secret key fo auth:
    client.println("k BC37ACB390EF2");
    TextFinder finder( client);
  }
  else {
    // kf you didn't get a connection to the server:
    Serial.println("connection failed");
  }
}



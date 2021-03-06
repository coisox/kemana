firebase.initializeApp({
	apiKey: 'AIzaSyCtelexWMdg5DnugUNbtX5gvrbPkmmG-OU',
	authDomain: 'fleet-utem.firebaseapp.com',
	databaseURL: 'https://fleet-utem.firebaseio.com',
	projectId: 'fleet-utem',
	storageBucket: 'fleet-utem.appspot.com',
	messagingSenderId: '414961957088'
});

var app = null;
var db = firebase.firestore();
db.settings({timestampsInSnapshots: true});

Number.prototype.toRad = function() {
	return this * Math.PI / 180;
}

Vue.use(VueMask.VueMaskPlugin);

db.enablePersistence({experimentalTabSynchronization:true}).then(function() {
	db.collection('config').doc('config').get().then(doc => {
		app = new Vue({
			el: '#app',
			data: {
				page: null,
				number: null,
				activationCode: localStorage.getItem('JEJAK_ACTIVATION_CODE'),
				trackingOn: false,
				geolocation: {
					updateInterval: doc.data().updateInterval,
					currentLatitude: null,
					currentLongitude: null,
					previousLatitude: null,
					previousLongitude: null,
					speed: null,
				},
				selectedVehicle: {
					registration: null,
					checkpoint: [],
					type: null
				},
				list: {
					vehicle: [],
				},
			},
			methods: {
				logout: function() {
					localStorage.removeItem('JEJAK_ACTIVATION_CODE');
					location.reload();
				},
				activate: function() {
					db.collection("smartphone").where('id', '==', app.activationCode).where('number', '==', app.number).get().then(docs => {
						if(docs.size) {
							localStorage.setItem('JEJAK_ACTIVATION_CODE', app.activationCode);
							app.page = 'tracking';
						}
						else {
							UIkit.modal.alert('Activation error. Please check your phone number and activation code.', { bgClose:true });
						}
					});
				},
				monitorList: function() {
					db.collection('vehicle').onSnapshot(function(docs) {
						app.list.vehicle = [];
						docs.forEach(function(doc) {
							app.list.vehicle.push(doc.data());
						});
					});
				},
				watchPosition: function() {
					var app = this;
					
					if(navigator.geolocation) {
						
						//================================================================ watch position in realtime
						navigator.geolocation.watchPosition(
							function(position){
							
								app.geolocation.currentLatitude = position.coords.latitude;
								app.geolocation.currentLongitude = position.coords.longitude;
								if(!app.geolocation.previousLatitude) {
									app.geolocation.previousLatitude = position.coords.latitude;
									app.geolocation.previousLongitude = position.coords.longitude;
								}
								
								//================================================================ track checkpoint arrival
								if(app.trackingOn) {
									//========================================================================== check current distance to headingCheckpoint
									var distance = app.getDistanceInKM(position.coords.latitude, position.coords.longitude, Number($('#headingCheckpoint option:selected').val().split(',')[0]), Number($('#headingCheckpoint option:selected').val().split(',')[1]));
									
									$('#logVersion').html(24);
									$('#logTime').html(moment().format('hh:mm:ssA'));
									$('#logLocation').html(position.coords.latitude + ',' + position.coords.longitude);
									$('#logAccuracy').html(position.coords.accuracy+' m');
									$('#logDistance2CP').html(distance);
									
									//========================================================================== 10meter considered arrived
									if(distance<0.01) {
										//var next = ($('#headingCheckpoint')[0].selectedIndex+1) % app.selectedVehicle.checkpoint.length;
										var next = $('#headingCheckpoint')[0].selectedIndex + 1;
										$('#headingCheckpoint').prop('selectedIndex', next).change();
										app.markPreviousCheckpoint();
									}
								}
							},
							function(error){
								$('#logLocation').html('Error '+error.code);
							},
							{maximumAge:0, timeout:Infinity, enableHighAccuracy:true}
						);

						//================================================================ update current position every "app.updateInterval" seconds
						setInterval(function(){
							if(app.geolocation.previousLatitude) {
								
								//========================================================================== if possible, get speed
								var distance = app.getDistanceInKM(app.geolocation.currentLatitude, app.geolocation.currentLongitude, app.geolocation.previousLatitude, app.geolocation.previousLongitude);
								app.geolocation.speed = (distance/app.geolocation.updateInterval)*3600;
								
								app.geolocation.previousLatitude = app.geolocation.currentLatitude;
								app.geolocation.previousLongitude = app.geolocation.currentLongitude;

								$('#logTime10').html(moment().format('hh:mm:ssA'));
								$('#logLocationPrev').html(app.geolocation.previousLatitude + ',' + app.geolocation.previousLongitude);
								$('#logSpeed').html(app.geolocation.speed);
								$('#logDistance').html(distance);
								
								if(app.trackingOn) {
									
									var data = {
										location: app.geolocation.currentLatitude+','+app.geolocation.currentLongitude,
										speed: app.geolocation.speed,
										timestamp: moment().format('YYYYMMDDHHmmss'),
										type: app.selectedVehicle.type
									};
									
									//========================================================================== update firebase current
									db.collection('tracking').doc('current').collection('current').doc(app.selectedVehicle.registration).set(data);
									
									//========================================================================== update firebase history
									db.collection('tracking').doc('history').collection(moment().format('YYYY')).doc(app.selectedVehicle.registration).collection(app.selectedVehicle.registration).add(data);
								}
							}
						}, app.geolocation.updateInterval*1000);
					} else {
						$('#logOnScreen').html('Geolocation is not supported by your phone.');
					}
					
				},
				startTracking: function() {
					if(app.selectedVehicle.registration && app.headingCheckpointSelected) app.trackingOn = !app.trackingOn;
					app.markPreviousCheckpoint();
				},
				markPreviousCheckpoint: function() {
					if(app.trackingOn) {
						
						for(i=0; i<app.selectedVehicle.checkpoint.length; i++) {
							app.selectedVehicle.checkpoint[i]['arrived'] = false;
							
							if(i<$('#headingCheckpoint')[0].selectedIndex) {
								app.selectedVehicle.checkpoint[i]['arrived'] = true;
								app.geolocation.previousLatitude = Number(app.selectedVehicle.checkpoint[i].location.split(',')[0]);
								app.geolocation.previousLongitude = Number(app.selectedVehicle.checkpoint[i].location.split(',')[1]);
							}
						}
						
						var data = {
							location: app.geolocation.currentLatitude+','+app.geolocation.currentLongitude,
							speed: app.geolocation.speed,
							timestamp: moment().format('YYYYMMDDHHmmss'),
							type: app.selectedVehicle.type
						};
						
						//========================================================================== update firebase current
						db.collection('tracking').doc('current').collection('current').doc(app.selectedVehicle.registration).set(data);
						
						//========================================================================== update firebase history
						db.collection('tracking').doc('history').collection(moment().format('YYYY')).doc(app.selectedVehicle.registration).collection(app.selectedVehicle.registration).add(data);
						
						//========================================================================== update firebase checkpoint
						db.collection('vehicle').doc(app.selectedVehicle.registration).update({'checkpoint': app.selectedVehicle.checkpoint});
					}
				},
				headingCheckpointSelected: function() {
					return $('#headingCheckpoint').val();
				},
				getDistanceInKM: function(lat1, lon1, lat2, lon2) {
					var R = 6371; // Radius of the earth in km
					var dLat = (lat2-lat1).toRad();	// Javascript functions in radians
					var dLon = (lon2-lon1).toRad(); 
					var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1.toRad()) * Math.cos(lat2.toRad()) * Math.sin(dLon/2) * Math.sin(dLon/2); 
					var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
					var d = R * c; // Distance in km
					return d;
				}
			},
			mounted: function() {
				$('#app').removeClass('uk-hidden');
							
				this.page = this.activationCode?'tracking':'welcome';
				
				this.monitorList();
				
				this.watchPosition();
			},
			watch: {
				'selectedVehicle.registration': function(newValue, oldValue) {
					app.selectedVehicle = app.list.vehicle.find(item => { return item.registration === app.selectedVehicle.registration });
				},
			}
		});
	});
});
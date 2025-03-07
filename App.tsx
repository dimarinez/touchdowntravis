import React, {Component} from 'react';
import {
  Dimensions,
  StyleSheet,
  SafeAreaView,
  Platform,
  Text,
  View,
  StatusBar,
  Image,
  ImageBackground,
  TouchableOpacity,
  ActivityIndicator
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Matter from 'matter-js';
import {GameEngine} from 'react-native-game-engine';
import Box from './renderers/Box';
import Travis from './assets/travis.png';
import Football from './assets/football.png';
import Taylor from './assets/taylor.png';
import WeddingRing from './assets/wedding-ring.png';
import WinningRing from './assets/ring-winner.png';
import tapIcon from './assets/tap-1-512.png';
import mobileAds, {BannerAd, BannerAdSize, RewardedAd, RewardedAdEventType} from 'react-native-google-mobile-ads';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import QRCode from 'react-native-qrcode-svg';

const {width, height} = Dimensions.get('screen');
const boxSize = Math.trunc(Math.max(width, height) * 0.075);
const safeBoxSize = isNaN(boxSize) ? 50 : boxSize; // Default to 50 if boxSize is NaN
const safeWidth = isNaN(width) ? Dimensions.get('window').width : width;
const safeHeight = isNaN(height) ? Dimensions.get('window').height : height;
const backgroundImage = require('./assets/football-field.jpg');
const backgroundImageCrowd = require('./assets/crowd.png');
const initialFootballY = safeHeight - boxSize * 2;

const ThrowBox = (entities, {touches}) => {
  touches
    .filter(t => t.type === 'press')
    .forEach(t => {
      const box = entities.initialBox;
      if (box) {
        Matter.Body.setStatic(box.body, false); // Make the box dynamic if it was static
        Matter.Body.applyForce(box.body, box.body.position, {x: 0, y: -0.15}); // Adjust force as needed
      }
    });
  return entities;
};

export default class App extends Component {
  Physics = (entities, { time }) => {
    Matter.Engine.update(this.engine, time.delta);

    const football = entities.initialBox;
    if (football) {
      const { body } = football;
      const minY = 0;
      const maxY = safeHeight;

      if (body.position.y < minY || body.position.y > maxY) {
        Matter.Body.setPosition(body, { x: safeWidth / 2, y: safeHeight - boxSize * 2 });
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
      }
    }

    return entities;
  };

  restartGame = () => {
    if (this.state.gameOverCount === 10) {
      this.loadRewardedAd();
    } else {
      this.setState({
        score: 0,
        gameOver: false,
        hasCrossedMiddle: false,
      });
      const initialEntities = this.getInitialEntities();
  
      if (this.gameEngine) {
        this.gameEngine.swap(initialEntities);
      }
  
      // Reset Matter.js engine and world
      Matter.World.clear(this.engine.world);
      Matter.Engine.clear(this.engine);
      this.initializeMatterEngine();
    }
  };

  constructor(props) {
    super(props);
    this.state = {
      score: 0,
      gameOver: false,
      zigzagSpeed: 0.02,
      zigzagDirection: 30,
      hasCrossedMiddle: false,
      verticalMoveUpSpeed: 0.2,
      collisionWithTarget: false,
      lastDirectionChange: 0,
      isPressed: false,
      gameOverCount: 0,
      isGameReady: false,
      isLoading: true,
      gameStarted: false, // Added gameStarted state
    };

    this.engine = null;
    this.world = null;
    this.width = width;
    this.height = height;
    this.boxSize = boxSize;
    this.safeBoxSize = safeBoxSize;
    this.safeWidth = safeWidth;
    this.safeHeight = safeHeight;
    this.initialFootballY = initialFootballY;
    this.Physics = this.Physics.bind(this);
    this.ZigzagMovement = this.ZigzagMovement.bind(this);
  }

  initializeMatterEngine = () => {
    this.engine = Matter.Engine.create({ enableSleeping: false });
    this.world = this.engine.world;

    // Define bodies here and add them to the world
    this.initialBox = Matter.Bodies.rectangle(
      this.safeWidth / 2,
      this.initialFootballY,
      this.safeBoxSize * 0.5,
      this.safeBoxSize * 0.5,
    );

    this.zigzagTarget = Matter.Bodies.rectangle(
      this.safeWidth / 4,
      this.safeHeight / 1.5,
      this.safeBoxSize * 1.5,
      this.safeBoxSize * 1.5,
      { isStatic: true },
    );

    this.floor = Matter.Bodies.rectangle(
      this.width / 2,
      this.height - this.boxSize / 1,
      this.width,
      this.boxSize,
      { isStatic: true },
    );

    this.ceiling = Matter.Bodies.rectangle(
      this.width / 2,
      this.boxSize / 2,
      this.width,
      this.boxSize,
      { isStatic: true },
    );

    Matter.World.add(this.world, [this.initialBox, this.floor, this.ceiling, this.zigzagTarget]);
    this.initializeCollision();
  };


  getInitialEntities = () => {
    return {
      physics: { engine: this.engine, world: this.world },
      floor: {
        body: this.floor,
        size: [this.width, this.boxSize],
        color: 'transparent',
        renderer: Box,
      },
      initialBox: {
        body: this.initialBox,
        size: [this.boxSize * 0.5, this.boxSize * 0.5],
        color: 'transparent',
        renderer: Box,
        imageSource: Football,
      },
      zigzagTarget: {
        body: this.zigzagTarget,
        size: [this.boxSize * 1.5, this.boxSize * 1.5],
        color: 'transparent',
        renderer: Box,
        imageSource: Travis,
      },
      ceiling: {
        body: this.ceiling,
        size: [this.width, this.boxSize],
        color: 'transparent',
        renderer: Box,
      },
    };
  };

  // handlePressIn = () => {
  //   this.setState({ isPressed: true });
  // };

  // handlePressOut = () => {
  //   this.setState({ isPressed: false });
  // };

  componentWillUnmount() {
    Matter.Events.off(this.engine, 'collisionStart');

    if (this.rewardedAdEventListener) {
      this.rewardedAdEventListener();
    }

    if (this.rewarded) {
      this.rewarded.destroy();
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.collisionWithTarget && !prevState.collisionWithTarget) {
      Matter.Body.setPosition(this.initialBox, {
        x: this.width / 2,
        y: this.initialFootballY,
      });
      Matter.Body.setStatic(this.initialBox, true);
      Matter.Body.setPosition(this.zigzagTarget, {x: this.width / 4, y: this.height / 1.5});
      this.setState({collisionWithTarget: false});
    }
  }

  componentDidMount() {
    (async () => {
      // Check and request the App Tracking Transparency permission
      if (Platform.OS === 'ios') {
          const result = await check(PERMISSIONS.IOS.APP_TRACKING_TRANSPARENCY);
          if (result === RESULTS.DENIED) {
              await request(PERMISSIONS.IOS.APP_TRACKING_TRANSPARENCY);
          }
      }

      const adapterStatuses = await mobileAds().initialize();
      console.log('Mobile Ads initialized:', adapterStatuses);

      this.initializeMatterEngine();
      setTimeout(() => {
        this.setState({
          isLoading: false,
          isGameReady: true,
        });
      }, 2000);
    })();
  }

  loadRewardedAd = () => {
    this.rewarded = RewardedAd.createForAdRequest('ca-app-pub-6197981947408031/2792035824', {
      requestNonPersonalizedAdsOnly: true,
    });
  
    this.rewardedAdEventListener = this.rewarded.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => {
        this.showRewardedAd();
      }
    );
  
    this.rewarded.load();
  };

  showRewardedAd = () => {
    if (this.rewarded && this.rewarded.loaded) {
      this.rewarded.show();
      this.setState({gameOverCount: 0});
    }
  };

  initializeCollision = () => {
    Matter.Events.on(this.engine, 'collisionStart', event => {
      const pairs = event.pairs;
      let gameOver = false;
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];

        if (
          (pair.bodyA === this.initialBox && pair.bodyB === this.ceiling) ||
          (pair.bodyA === this.ceiling && pair.bodyB === this.initialBox)
        ) {
          gameOver = true; // Set the flag to trigger game over
        } else if (
          (pair.bodyA === this.initialBox && pair.bodyB === this.zigzagTarget) ||
          (pair.bodyA === this.zigzagTarget && pair.bodyB === this.initialBox)
        ) {
          this.setState(prevState => {
            const newScore = prevState.score + 7;
            return {
              score: newScore,
              hasCrossedMiddle: false,
              collisionWithTarget: true,
            };
          });
        }
      }

      if (gameOver) {
        this.setState(prevState => ({
          gameOver: true,
          gameOverCount: prevState.gameOverCount + 1,
        }));
      }
    });
  }

  startGame = () => {
      this.setState({gameStarted: true});
  };

  ZigzagMovement = (entities, { time }) => {
    const target = entities.zigzagTarget;
    if (target) {
      const { body } = target;

      // Example state interaction (pseudo-code, assumes this function is inside your component)
      if (!this.state.hasCrossedMiddle && body.position.x >= this.safeWidth / 2) {
        this.setState({ hasCrossedMiddle: true });
      }

      // Movement logic remains the same
      if (!target.nextToggle || time.current > target.nextToggle) {
        target.moving = Math.random() < 0.5;
        target.nextToggle = time.current + Math.random() * 1000;
        if (Math.random() < 0.5) {
          this.state.zigzagDirection *= -1; // Assuming zigzagDirection is a part of the component's state
        }
      }

      if (target.moving) {
        let xMove = this.state.zigzagDirection * this.state.zigzagSpeed * time.delta;
        if (!this.state.hasCrossedMiddle) {
          xMove = Math.abs(xMove) * (body.position.x < this.safeWidth / 2 ? 1 : -1);
        }
        Matter.Body.translate(body, { x: xMove, y: 0 });

        Matter.Body.translate(body, {
          x: 0,
          y: -this.state.verticalMoveUpSpeed * time.delta,
        });
      }

      if (body.position.x > this.width - this.boxSize || body.position.x < this.boxSize) {
        this.state.zigzagDirection *= -1;
      }

      if (body.position.y - 100 < this.boxSize) {
        this.setState({ gameOver: true });
        Matter.Body.setPosition(body, { x: this.safeWidth / 2, y: this.safeHeight / 1.5 });
      }
    }
    return entities;
  };

  getSpritePosition = () => {
    const {score} = this.state;
    let position = {top: -10, left: -7}; // Default position

    if (score > 30) {
      position = {top: -10, left: -73};
    }
    if (score > 70) {
      position = {top: -99, left: -73};
    }
    if (score > 150) {
      position = {top: -99, left: -135};
    }

    return position;
  };

  render() {
    const { isLoading, isGameReady } = this.state;
    const {top, left} = this.getSpritePosition();

    if (!this.state.gameStarted && !this.state.gameOver) {
      return (
        <>
        <ImageBackground source={backgroundImage} style={styles.startScreen}>
          <Image source={Travis} style={{width: 200, height: 300, marginBottom: 30}}/>
          <View style={styles.buttonOuterContainer}>
            <LinearGradient
              colors={['#FFEA00', '#FFD700', '#FFC700']} // Adjust for your desired look
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buttonGradient}
            >
              <TouchableOpacity 
              style={{height: '100%', width: '100%', justifyContent: 'center', alignItems: 'center'}}
              onPressIn={this.handlePressIn}
              onPressOut={this.handlePressOut}
              onPress={this.startGame}
              activeOpacity={1}>
                <Text style={styles.buttonText}>Start Game</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </ImageBackground>
        <SafeAreaView style={styles.bannerStyle}>
          <BannerAd
            size={BannerAdSize.BANNER}
            unitId="ca-app-pub-6197981947408031/1167591833"  
            onAdLoaded={() => {
              console.log('Advert loaded');
            }}
            onAdFailedToLoad={error => {
              console.error('Advert failed to load: ', error);
            }}
          />
        </SafeAreaView>
        </>
      );
    }

    if (this.state.gameOver && this.state.gameStarted) {
      return (
        <View style={styles.gameOverContainer}>
          
          <Text style={[styles.score, {color: 'black', marginBottom: 30}]}>Score: {this.state.score}</Text>
          {this.state.score >= 150 ? (
            <>
            <Image source={WinningRing} style={{width: 300, height: 300}}/>
            <View style={{marginBottom: 30}}>
              <QRCode
                value={`ID-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`}
                size={100}
                color="black"
                backgroundColor="white"
              />
            </View>
          </>
          ) : (
            <Image source={WeddingRing} style={{width: 400, height: 300, marginBottom: 40}}/>
          )
          }
          <View style={styles.buttonOuterContainer}>
            <LinearGradient
              colors={['#FFEA00', '#FFD700', '#FFC700']} // Adjust for your desired look
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buttonGradient}
            >
              <TouchableOpacity 
              onPressIn={this.handlePressIn}
              onPressOut={this.handlePressOut}
              onPress={this.restartGame}
              style={{height: '100%', width: '100%', justifyContent: 'center', alignItems: 'center'}}
              activeOpacity={1}>
                <Text style={styles.buttonText}>Try Again</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
          <SafeAreaView style={styles.bannerStyle}>
          <BannerAd
            size={BannerAdSize.BANNER}
            unitId="ca-app-pub-6197981947408031/3530548213"  
            onAdLoaded={() => {
              console.log('Advert loaded');
            }}
            onAdFailedToLoad={error => {
              console.error('Advert failed to load: ', error);
            }}
          />
        </SafeAreaView>
        </View>
      );
    }

    if (isLoading) {
      return (
        <>
        <View style={styles.loadingContainer}>
        <Image source={tapIcon} style={{
          height: 100,
          width: 100,
          marginBottom: 20,
        }}>
      </Image>
      <Text style={styles.tapToThrow}>Tap to throw!</Text>
    </View>
    </>
      );
    }

    if (!isGameReady) {
      return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
      );
    }

    return (
      <>
        <View style={styles.scoreContainer}>
        <Image source={backgroundImageCrowd} style={{
            height: '100%',
            position: 'absolute',
            width: width,
            left:0,
            right: 0,
            zIndex: 0,
          }}>
        </Image>
          <View style={styles.taylorContainer}>
            <ImageBackground
              source={Taylor}
              style={{
                ...styles.taylorSprite,
                top,
                left,
              }}
            />
          </View>
          <View style={styles.scoreboard}>
            <View style={styles.teamScore}>
              <Text style={styles.score}>{this.state.score}</Text>
            </View>
          </View>
        </View>
        <ImageBackground source={backgroundImage} style={styles.imageContainer}>
          <GameEngine
            ref={(ref) => { this.gameEngine = ref; }}
            style={styles.container}
            systems={[this.Physics, ThrowBox, this.ZigzagMovement]}
            entities={this.getInitialEntities()}>
            <StatusBar hidden={true} />
          </GameEngine>
        </ImageBackground>

        <SafeAreaView style={styles.bannerStyle}>
          <BannerAd
            size={BannerAdSize.BANNER}
            unitId="ca-app-pub-6197981947408031/1987200550"  
            onAdLoaded={() => {
              console.log('Advert loaded');
            }}
            onAdFailedToLoad={error => {
              console.error('Advert failed to load: ', error);
            }}
          />
        </SafeAreaView>
      </>
    );
  }
}

const styles = StyleSheet.create({
  bannerStyle: {
    position: 'absolute',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    left: 0,
    right: 0,
    bottom: 0,
  },
  tapToThrow: {
    color: '#000', // Text color
    fontSize: 16, // Adjust as needed
    fontFamily: 'PressStart2P-Regular',
  },
  buttonOuterContainer: {
    height: 50,
    width: 200,
    borderRadius: 10,
    backgroundColor: '#cfae02',
  },
  buttonGradient: {
    position: 'absolute',
    bottom: 5,
    height: 50,
    width: 200,
    borderRadius: 10,
  },
  buttonText: {
    color: '#FFF', // Text color
    fontSize: 16, // Adjust as needed
    fontFamily: 'PressStart2P-Regular',
  },
  loadingContainer: {
    flex: 1,
    height: '100%',
    position: 'absolute',
    width: '100%',
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 18,
  },
  taylorContainer: {
    position: 'absolute',
    width: 63, // Width of the visible area
    height: '90%', // Height of the visible area
    left: 30,
    bottom: 0,
    overflow: 'hidden',
  },
  taylorSprite: {
    width: 200, // Total width of your sprite sheet
    height: 200, // Total height of your sprite sheet
    position: 'absolute',
  },
  startScreen: {
    flex: 1,
    paddingBottom: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 30,
    color: '#FFFFFF',
    fontFamily: 'PressStart2P-Regular',
  },
  startButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 5,
  },
  startButtonText: {
    fontSize: 18,
    fontFamily: 'PressStart2P-Regular',
    color: '#FFF',
  },
  scoreContainer: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'absolute',
    width: '100%',
    flex: 1,
    overflow: 'hidden',
    height: 98,
  },
  scoreboard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 12,
    backgroundColor: 'black',
  },
  teamScore: {
    alignItems: 'center',
    marginHorizontal: 7,
  },
  teamName: {
    fontSize: 10,
    color: '#FFD700', // Yellow
    fontFamily: 'PressStart2P-Regular',
  },
  score: {
    fontSize: 20,
    color: '#FFD700', // Yellow
    fontFamily: 'PressStart2P-Regular',
  },
  vsText: {
    fontSize: 10,
    color: '#FFD700', // Yellow
    fontFamily: 'PressStart2P-Regular',
    marginHorizontal: 5,
  },
  imageContainer: {
    flex: 1,
    top: 100,
  },
  container: {
    flex: 1,
  },
  gameOverContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

 /*

  MACD - DJM 31/12/2013

  (updated a couple of times since, check git history)

 */

// helpers
var _ = require('lodash');
var log = require('../core/log.js');

var RSI = require('./indicators/RSI.js');

// let's create our own method
var method = {};

// prepare everything our method needs
method.init = function() {
  // keep state about the current trend
  // here, on every new candle we use this
  // state object to check if we need to
  // report it.
  this.trend = {
    direction: 'none',
    duration: 0,
    persisted: false,
    adviced: false
  };

  // how many candles do we need as a base
  // before we can start giving advice?
  this.requiredHistory = this.tradingAdvisor.historySize;

  // define the indicators we need
  this.addIndicator('macd', 'MACD', this.settings);

  this.trailingstop = {
    enabled: false,
    enabledAt: 0,
    pctDrop: this.settings.trailingstop.pctDrop
  }

  this.stoploss = {
    enabled: false,
    enabledAt: 0,
    pctDrop: this.settings.stoploss.pctDrop
  }

  this.interval = this.settings.interval;

  this.rsitrend = {
    direction: 'none',
    duration: 0,
    persisted: false,
    adviced: false
  };

  this.requiredHistory = this.tradingAdvisor.historySize;

  // define the indicators we need
  this.addIndicator('rsi', 'RSI', { interval: this.interval });

  this.RSIhistory = [];
}

// what happens on every new candle?
method.update = function(candle) {
  this.rsi = this.indicators.rsi.result;

  this.RSIhistory.push(this.rsi);

  if(_.size(this.RSIhistory) > this.interval)
    // remove oldest RSI value
    this.RSIhistory.shift();

  this.lowestRSI = _.min(this.RSIhistory);
  this.highestRSI = _.max(this.RSIhistory);
  this.stochRSI = ((this.rsi - this.lowestRSI) / (this.highestRSI - this.lowestRSI)) * 100;
}

// for debugging purposes: log the last calculated
// EMAs and diff.
method.log = function(candle) {
  var digits = 8;
  var macd = this.indicators.macd;
  var rsi = this.indicators.rsi;


  var diff = macd.diff;
  var signal = macd.signal.result;

  // log.debug('calculated MACD properties for candle:');
  // log.debug('\t', 'short:', macd.short.result.toFixed(digits));
  // log.debug('\t', 'long:', macd.long.result.toFixed(digits));
  // log.debug('\t', 'macd:', diff.toFixed(digits));
  // log.debug('\t', 'signal:', signal.toFixed(digits));
  // log.debug('\t', 'macdiff:', macd.result.toFixed(digits));
  log.debug('price: ', candle.close, ', trade: ', this.currentTrend, ', stoploss: ', this.stoploss.enabled, ', stopploss at: ', this.stoploss.enabledAt, ', trailingstop: ', this.trailingstop.enabled, 'ts at: ', this.trailingstop.enabledAt, 'pct: ', candle.close/this.stoploss.enabledAt, 'storchrsi:', this.stochRSI.toFixed(2), '/', this.settings.rsi_thresholds.low);
    log.debug('calculated StochRSI properties for candle:');
  log.debug('\t', 'rsi:', this.rsi.toFixed(digits));
  log.debug("StochRSI min:\t\t" + this.lowestRSI.toFixed(digits));
  log.debug("StochRSI max:\t\t" + this.highestRSI.toFixed(digits));
  log.debug("StochRSI Value:\t\t" + this.stochRSI.toFixed(2));
}

// Only buy if the short is above the long EMA
// Sell immediately if the short goes below the long even if at a loss
// if we are allowed to buy, only do so when the EMA signal is positive over the macd ema
// If the signal goes down through the the macd ema then set a trailing stop
// if it goes back up again remove the trailing stop
// Also set a trailingstop at 1.5% of the original position
method.check = function(candle) {
  var macddiff = this.indicators.macd.result;
  var centre = this.indicators.macd.centre;

  if (centre === 'below') {
    // Close any trade if open
    if (this.currentTrend === 'long') {
      this.currentTrend = 'short';
      this.advice('short');
      this.stoploss.enabled = false
      this.trailingstop.enabled = false
      log.debug('centre out');
    } else {
      log.debug('Not buying due to falling price');
    }
  } else {
    if (this.stoploss.enabled && ((candle.close/this.stoploss.enabledAt) < (100-this.stoploss.pctDrop) / 100)) {
      // We have hit a stoploss, close the trade
      this.currentTrend = 'short';
      this.advice('short');
      this.stoploss.enabled = false
      this.trailingstop.enabled = false
      log.debug('stopped out');
    } else if (this.trailingstop.enabled && ((candle.close/this.trailingstop.enabledAt) < (100-this.trailingstop.pctDrop) / 100)) {
      // We have hit a trailingstop, close the trade
      this.currentTrend = 'short';
      this.advice('short');
      this.stoploss.enabled = false
      this.trailingstop.enabled = false
      log.debug('trailed out');
    } else {
      // in this condition trading is allowed
      if(macddiff > this.settings.thresholds.up) {

        // new trend detected
        if(this.trend.direction !== 'up')
          // reset the state for the new trend
          this.trend = {
            duration: 0,
            persisted: false,
            direction: 'up',
            adviced: false
          };

        this.trend.duration++;

        log.debug('In uptrend since', this.trend.duration, 'candle(s)');

        if(this.trend.duration >= this.settings.thresholds.persistence)
          this.trend.persisted = true;

        if(this.trend.persisted && !this.trend.adviced) {
          if(this.stochRSI < this.settings.rsi_thresholds.low) {
            if (this.currentTrend !== 'long') {
              this.currentTrend = 'long';
              this.advice('long');
              this.stoploss.enabled = true;
              this.stoploss.enabledAt = candle.close;
              log.debug('buy');
            } else {
              // We are alrady long so we must have dipped out and in again. There will be a trailingstop, lets disable that
              if (this.trailingstop.enabled) {
                this.trailingstop.enabled = false;
                log.debug('remove trailing stop');
              }
              this.advice();
            }
          } else {
            log.debug('RSI prevented buy');
            this.advice();
          }

        } else
          this.advice();

      } else if(macddiff < this.settings.thresholds.down) {

        // new trend detected
        if(this.trend.direction !== 'down')
          // reset the state for the new trend
          this.trend = {
            duration: 0,
            persisted: false,
            direction: 'down',
            adviced: false
          };

        this.trend.duration++;

        log.debug('In downtrend since', this.trend.duration, 'candle(s)');

        if(this.trend.duration >= this.settings.thresholds.persistence)
          this.trend.persisted = true;

        if(this.trend.persisted && !this.trend.adviced) {
          this.trend.adviced = true;
          if (this.currentTrend === 'long') {
            this.trailingstop.enabled = true;
            this.trailingstop.enabledAt = candle.close;
            log.debug('enable trailing stop');
            this.advice();
          } else
            this.advice();
         }

      } else {

        log.debug('In no trend');

        // we're not in an up nor in a downtrend
        // but for now we ignore sideways trends
        //
        // read more @link:
        //
        // https://github.com/askmike/gekko/issues/171

        // this.trend = {
        //   direction: 'none',
        //   duration: 0,
        //   persisted: false,
        //   adviced: false
        // };

        this.advice();
      }
    }
  }
}

module.exports = method;

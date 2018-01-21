// This is a simple strategy to buy low and sell for a target profit
// We buy when the price is a given % under the long term average
// This is designed to pick up cheap currency in a mini crash

var log = require('../core/log');

// Let's create our own strat
var strat = {};

// Prepare everything our method needs
strat.init = function() {
  this.input = 'candle';
  this.currentTrend = 'short';
  this.currentTrend;
  this.requiredHistory = this.tradingAdvisor.historySize;

  // define the indicators we need
  this.addIndicator('sma', 'SMA', this.settings.period);
  this.pctDrop = (100-this.settings.pctDrop) / 100;
  this.pctTarget = (100+this.settings.pctTarget) / 100
  log.debug(this.pctDrop);
  log.debug(this.pctTarget);
}

// What happens on every new candle?
strat.update = function(candle) {


}

// For debugging purposes.
strat.log = function() {
}

// Based on the newly calculated
// information, check if we should
// update or not.
strat.check = function(candle) {
  var sma = this.indicators.sma.result;

  if (this.currentTrend==='short') {
    if((candle.close/sma) < this.pctDrop) {
      this.boughtAt = candle.close
      this.currentTrend = 'long';
      this.advice('long');
    }
  } else {
    if ((candle.close/this.boughtAt) > this.pctTarget) {
      this.currentTrend = 'short';
      this.advice('short');
    }
  }
}

module.exports = strat;

const { binance } = require('../../../helpers');
const {
  refreshOpenOrdersWithSymbol,
  getAccountInfoFromAPI
} = require('../../trailingTradeHelper/common');

/**
 * Cancel order
 *
 * @param {*} logger
 * @param {*} symbol
 * @param {*} order
 */
const cancelOrder = async (logger, symbol, order) => {
  logger.info(
    { debug: true, function: 'cancelOrder', order },
    'Cancelling open orders'
  );
  // Cancel open orders first to make sure it does not have unsettled orders.
  let result = false;
  try {
    const apiResult = await binance.client.cancelOrder({
      symbol,
      orderId: order.orderId
    });
    logger.info({ apiResult }, 'Cancelled open orders');

    result = true;
  } catch (e) {
    logger.info(
      { e },
      'Cancel failed, but it is ok. The order may already be executed. We just wait for next round to be handled'
    );
  }

  return result;
};

/**
 *
 * Handle open orders
 *
 * @param {*} logger
 * @param {*} rawData
 */
const execute = async (logger, rawData) => {
  const data = rawData;

  const {
    symbol,
    openOrders,
    buy: { limitPrice: buyLimitPrice },
    sell: { limitPrice: sellLimitPrice }
  } = data;

  // eslint-disable-next-line no-restricted-syntax
  for (const order of openOrders) {
    if (order.type !== 'STOP_LOSS_LIMIT') {
      // eslint-disable-next-line no-continue
      continue;
    }
    // Is the stop price is higher than current limit price?
    if (order.side.toLowerCase() === 'buy') {
      if (parseFloat(order.stopPrice) >= buyLimitPrice) {
        logger.info(
          { stopPrice: order.stopPrice, buyLimitPrice },
          'Stop price is higher than buy limit price, cancel current buy order'
        );
        // Cancel current order
        // eslint-disable-next-line no-await-in-loop
        const cancelResult = await cancelOrder(logger, symbol, order);
        if (cancelResult === false) {
          // If cancelling the order is failed, it means the order may already be executed or does not exist anymore.
          // Hence, refresh the order and process again in the next tick.
          // Get open orders and update cache
          // eslint-disable-next-line no-await-in-loop
          data.openOrders = (await refreshOpenOrdersWithSymbol(logger, symbol)).filter(o => o.symbol === symbol);

          data.buy.openOrders = data.openOrders.filter(o => o.side.toLowerCase() === 'buy')

          // Refresh account info
          // eslint-disable-next-line no-await-in-loop
          data.accountInfo = await getAccountInfoFromAPI(logger);

          data.action = 'buy-order-checking';
          return data;
        }

        // Reset buy open orders
        data.buy.openOrders = [];

        // Set action as buy
        data.action = 'buy';

        // Get account information again because the order is cancelled
        // eslint-disable-next-line no-await-in-loop
        data.accountInfo = await getAccountInfoFromAPI(logger);
      } else {
        logger.info(
          { stopPrice: order.stopPrice, buyLimitPrice },
          'Stop price is less than buy limit price, wait for buy order'
        );
        // Set action as buy
        data.action = 'buy-order-wait';
      }
    }

    // Is the stop price is less than current limit price?
    if (order.side.toLowerCase() === 'sell') {
      if (parseFloat(order.stopPrice) <= sellLimitPrice) {
        logger.info(
          { stopPrice: order.stopPrice, sellLimitPrice },
          'Stop price is less than sell limit price, cancel current sell order'
        );

        // Cancel current order
        // eslint-disable-next-line no-await-in-loop
        const cancelResult = await cancelOrder(logger, symbol, order);
        if (cancelResult === false) {
          // If cancelling the order is failed, it means the order may already be executed or does not exist anymore.
          // Hence, refresh the order and process again in the next tick.
          // Get open orders and update cache
          // eslint-disable-next-line no-await-in-loop
          data.openOrders = (await refreshOpenOrdersWithSymbol(logger, symbol)).filter(o => o.symbol === symbol);

          data.sell.openOrders = data.openOrders.filter(o => o.side.toLowerCase() === 'sell')

          // Refresh account info
          // eslint-disable-next-line no-await-in-loop
          data.accountInfo = await getAccountInfoFromAPI(logger);

          data.action = 'sell-order-checking';
          return data;
        }

        // Reset sell open orders
        data.sell.openOrders = [];

        // Set action as sell
        data.action = 'sell';

        // Get account information again because the order is cancelled
        // eslint-disable-next-line no-await-in-loop
        data.accountInfo = await getAccountInfoFromAPI(logger);
      } else {
        logger.info(
          { stopPrice: order.stopPrice, sellLimitPrice },
          'Stop price is higher than sell limit price, wait for sell order'
        );
        data.action = 'sell-order-wait';
      }
    }
    logger.info({ action: data.action }, 'Determined action');
  }

  return data;
};

module.exports = { execute };

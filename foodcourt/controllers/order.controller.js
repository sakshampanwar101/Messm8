const mongoose = require('mongoose');

const Order = mongoose.model('Order');
const Cart = mongoose.model('Cart');
const CartItem = mongoose.model('CartItem');

const ACTIVE_QUEUE_STATUSES = ['Queued', 'Preparing', 'Ready'];
const PREP_PROGRESS_STATUSES = ['Queued', 'Preparing'];
const ALLOWED_TRANSITIONS = {
    Queued: ['Preparing', 'Cancelled'],
    Preparing: ['Ready', 'Cancelled'],
    Ready: ['Collected', 'Cancelled'],
    Collected: [],
    Cancelled: []
};

const buildCustomerProfile = (sessionUser, customer = {}) => {
    const errors = [];
    if (!sessionUser) {
        errors.push('User session missing.');
    }
    const payload = {
        messId: (customer.messId || sessionUser?.profile?.messId || sessionUser?.identifier || '').trim(),
        name: (customer.name || sessionUser?.name || '').trim(),
        rollNumber: (customer.rollNumber || sessionUser?.profile?.rollNumber || '').trim(),
        contact: (customer.contact || sessionUser?.profile?.contact || '').trim()
    };

    if (!payload.messId) errors.push('customer.messId is required.');
    if (!payload.name) errors.push('customer.name is required.');
    if (!payload.rollNumber) errors.push('customer.rollNumber is required.');

    return { errors, payload };
};

const isTransitionAllowed = (current, next) => {
    if (!current || !next) return false;
    const allowed = ALLOWED_TRANSITIONS[current] || [];
    return allowed.includes(next);
};

const clearCart = async(cart) => {
    if (!cart) return;
    const cartItemIds = cart.cartItems && cart.cartItems.length ?
        cart.cartItems.map(ci => ci._id || ci) :
        [];
    if (cartItemIds.length) {
        await CartItem.deleteMany({ _id: { $in: cartItemIds } });
    }
    await Cart.deleteOne({ _id: cart._id });
};

const buildOrderItemsFromCart = (cartItems = []) => {
    return cartItems.reduce((acc, cartItem) => {
        if (!cartItem.foodItem) {
            return acc;
        }
        acc.push({
            food: cartItem.foodItem.name,
            quantity: cartItem.quantity,
            unitPrice: Number(cartItem.foodItem.unitPrice) || 0
        });
        return acc;
    }, []);
};

module.exports.createOrder = async(req, res, next) => {
    try {
        const sessionUser = req.session.user;
        if (!sessionUser || sessionUser.role !== 'student') {
            return res.status(403).json({
                status: false,
                message: "Only logged-in students can place orders."
            });
        }
        if (!req.session.cartId) {
            return res.status(404).json({
                status: false,
                message: "No cart items found. Please add items to cart to place order."
            });
        }

        const cart = await Cart.findOne({ _id: req.session.cartId }).populate({
            path: 'cartItems',
            populate: { path: 'foodItem' }
        });

        if (!cart || !cart.cartItems.length) {
            return res.status(404).json({
                status: false,
                message: "Cart is empty. Please add items before placing an order."
            });
        }

        const { errors, payload } = buildCustomerProfile(sessionUser, req.body.customer || {});
        if (errors.length) {
            return res.status(422).json({
                status: false,
                message: "Customer profile is incomplete.",
                errors
            });
        }

        const orderItems = buildOrderItemsFromCart(cart.cartItems);
        if (!orderItems.length) {
            return res.status(422).json({
                status: false,
                message: "Unable to build order items from cart. Please refresh cart and try again."
            });
        }

        const queueNumber = await Order.getNextQueueNumber();
        const ticketId = Order.generateTicketId('MM', queueNumber);
        const pendingAhead = await Order.countDocuments({ status: { $in: PREP_PROGRESS_STATUSES } });
        const estimatedPickup = new Date(Date.now() + Math.max(pendingAhead, 1) * 5 * 60 * 1000);

        let deliveryDate = new Date(Date.now() + 30 * 60 * 1000);
        if (req.body.deliveryDate) {
            const requested = new Date(req.body.deliveryDate);
            if (!isNaN(requested) && requested > new Date()) {
                deliveryDate = requested;
            }
        }

        const newOrder = new Order({
            orderItems,
            status: 'Queued',
            queueNumber,
            ticketId,
            estimatedPickup,
            deliveryDate,
            customer: payload,
            specialInstructions: req.body.specialInstructions || '',
            pickupWindow: req.body.pickupWindow || null,
            statusHistory: [{
                status: 'Queued',
                note: 'Order placed digitally',
                changedAt: new Date()
            }],
            notificationLog: [{
                channel: 'in-app',
                message: `Ticket ${ticketId} generated. Queue number ${queueNumber}.`
            }]
        });

        await newOrder.save();
        await clearCart(cart);
        req.session.cartId = null;
        req.session.orderId = newOrder._id;

        return res.status(201).json(newOrder);
    } catch (err) {
        return next(err);
    }
};

module.exports.getOrders = async(req, res, next) => {
    try {
        const filter = {};
        if (req.query.status) {
            const statuses = req.query.status.split(',').map(s => s.trim());
            filter.status = { $in: statuses };
        }
        const orders = await Order.find(filter).sort({ date: -1 }).lean();
        return res.status(200).json(orders);
    } catch (err) {
        return next(err);
    }
};

module.exports.getStudentOrders = async(req, res, next) => {
    try {
        const sessionUser = req.session.user;
        // if (!sessionUser || sessionUser.role !== 'student' || !sessionUser.profile || !sessionUser.profile.messId) {
        //     return res.status(403).json({
        //         status: false,
        //         message: "Student login required."
        //     });
        // }
        const orders = await Order.find({
            'customer.messId': sessionUser.profile.messId
        }).sort({ date: -1 }).lean();
        return res.status(200).json(orders);
    } catch (err) {
        return next(err);
    }
};

module.exports.getOrderReport = async(req, res, next) => {
    try {
        const summary = await Order.aggregate([{
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    status: '$_id',
                    count: 1,
                    _id: 0
                }
            }
        ]);

        const totals = summary.reduce((acc, item) => {
            acc[item.status] = item.count;
            acc.total = (acc.total || 0) + item.count;
            return acc;
        }, {});

        const recentOrders = await Order.find().sort({ date: -1 }).limit(50).lean();

        return res.status(200).json({
            summary: totals,
            orders: recentOrders
        });
    } catch (err) {
        return next(err);
    }
};

module.exports.getOrder = async(req, res, next) => {
    try {
        const criteria = {};
        if (req.query.ticketId) {
            criteria.ticketId = req.query.ticketId;
        } else if (req.query.queueNumber) {
            criteria.queueNumber = Number(req.query.queueNumber);
        } else if (req.session.orderId) {
            criteria._id = req.session.orderId;
        } else {
            return res.status(404).json({
                status: false,
                message: "No order identifier provided."
            });
        }

        const order = await Order.findOne(criteria).lean();
        if (!order) {
            return res.status(404).json({
                status: false,
                message: "Order not found."
            });
        }

        return res.status(200).json(order);
    } catch (err) {
        return next(err);
    }
};

module.exports.getQueueSnapshot = async(req, res, next) => {
    try {
        const statuses = req.query.status ?
            req.query.status.split(',').map(s => s.trim()) :
            ACTIVE_QUEUE_STATUSES;
        const queue = await Order.find({
            status: { $in: statuses }
        }).sort({ queueNumber: 1, date: 1 }).lean();
        return res.status(200).json(queue);
    } catch (err) {
        return next(err);
    }
};

module.exports.trackOrderByTicket = async(req, res, next) => {
    try {
        const ticketId = req.params.ticketId;
        if (!ticketId) {
            return res.status(422).json({
                status: false,
                message: "ticketId is required."
            });
        }
        const order = await Order.findOne({ ticketId }).lean();
        if (!order) {
            return res.status(404).json({
                status: false,
                message: "Order not found for provided ticket."
            });
        }

        return res.status(200).json({
            _id: order._id,
            ticketId: order.ticketId,
            queueNumber: order.queueNumber,
            status: order.status,
            customer: order.customer,
            orderItems: order.orderItems,
            estimatedPickup: order.estimatedPickup,
            lastUpdated: order.statusHistory && order.statusHistory.length ?
                order.statusHistory[order.statusHistory.length - 1].changedAt :
                order.updatedAt,
            notificationLog: order.notificationLog
        });
    } catch (err) {
        return next(err);
    }
};

const applyStatusUpdate = async(orderId, nextStatus, note) => {
    const order = await Order.findOne({ _id: orderId });
    if (!order) {
        throw new Error('ORDER_NOT_FOUND');
    }

    if (order.status === nextStatus) {
        return order;
    }

    if (!isTransitionAllowed(order.status, nextStatus)) {
        const error = new Error(`Transition from ${order.status} to ${nextStatus} is not allowed.`);
        error.code = 'INVALID_TRANSITION';
        throw error;
    }

    order.status = nextStatus;
    order.logStatusChange(nextStatus, note || `Status updated to ${nextStatus}`);

    if (nextStatus === 'Ready') {
        order.pickupNotifiedAt = new Date();
        order.recordNotification(`Ticket ${order.ticketId} is ready for pickup.`);
    }

    if (nextStatus === 'Collected') {
        order.pickedUpAt = new Date();
    }

    await order.save();
    return order;
};

module.exports.updateOrderStatus = async(req, res, next) => {
    try {
        const orderId = req.params.id;
        const nextStatus = req.body.status;
        const note = req.body.note;

        if (!orderId || !nextStatus) {
            return res.status(422).json({
                status: false,
                message: "Order id and next status are required."
            });
        }

        const order = await applyStatusUpdate(orderId, nextStatus, note);
        return res.status(200).json(order);
    } catch (err) {
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({
                status: false,
                message: "Order not found."
            });
        }
        if (err.code === 'INVALID_TRANSITION') {
            return res.status(409).json({
                status: false,
                message: err.message
            });
        }
        return next(err);
    }
};

module.exports.cancelOrder = async(req, res, next) => {
    try {
        const orderId = req.params.id || req.session.orderId;
        if (!orderId) {
            return res.status(404).json({
                status: false,
                message: "Order id is required to cancel."
            });
        }
        const sessionUser = req.session.user;
        const orderDoc = await Order.findOne({ _id: orderId });
        if (!orderDoc) {
            return res.status(404).json({
                status: false,
                message: "Order not found."
            });
        }
        const isStaff = sessionUser && ['staff', 'admin'].includes(sessionUser.role);
        const isOwner = sessionUser && sessionUser.role === 'student' &&
            orderDoc.customer && sessionUser.profile &&
            sessionUser.profile.messId === orderDoc.customer.messId;
        if (!isStaff && !isOwner) {
            return res.status(403).json({
                status: false,
                message: "You are not allowed to cancel this order."
            });
        }
        if (orderDoc.status === 'Cancelled') {
            return res.status(200).json({
                status: true,
                message: "Order already cancelled.",
                order: orderDoc
            });
        }
        const order = await applyStatusUpdate(orderId, 'Cancelled', isStaff ? 'Order cancelled by staff' : 'Order cancelled by student');
        return res.status(200).json({
            status: true,
            message: "Order cancelled successfully.",
            order
        });
    } catch (err) {
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({
                status: false,
                message: "Order not found."
            });
        }
        if (err.code === 'INVALID_TRANSITION') {
            return res.status(409).json({
                status: false,
                message: err.message
            });
        }
        return next(err);
    }
};

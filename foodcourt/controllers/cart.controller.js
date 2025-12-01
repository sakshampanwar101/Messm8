const mongoose = require('mongoose');

const Food = mongoose.model('Food');
const Menu = mongoose.model('Menu');
const CartItem = mongoose.model('CartItem');
const Cart = mongoose.model('Cart');

const ensureStudentSession = (req, res) => {
    // if (!req.session.user || req.session.user.role !== 'student') {
    //     res.status(403).json({
    //         status: false,
    //         message: "Student login required to manage cart."
    //     });
    //     return false;
    // }
    return true;
};

module.exports.getCart = (req, res, next) => {
    if (!ensureStudentSession(req, res)) return;
    if (req.session.cartId) {
        Cart.findOne({
            _id: req.session.cartId
        }, (errCart, cart) => {
            if (cart)
                res.status(200).json(cart);
            else
                res.status(200).json();

        }).populate({
            path: 'cartItems',
            populate: {
                path: 'foodItem'
            }
        });
    } else {
        res.status(200).json();
    }
}

module.exports.addCartItem = async(req, res, next) => {
    if (!ensureStudentSession(req, res)) return;
    const item = req.body.food_id;
    const quantity = Number(req.body.quantity) || 1;

    if (!item) {
        return res.status(422).json({
            status: false,
            message: "food_id is required to add an item to cart."
        });
    }

    if (quantity < 1) {
        return res.status(422).json({
            status: false,
            message: "Quantity must be at least 1."
        });
    }
    if (req.session.cartId) {
        Cart.findOne({
            _id: req.session.cartId
        }, async(errCart, cart) => {
            if (cart) {
                let itemPresent = false;
                for (let i = 0; i < cart.cartItems.length; i++) {
                    if (cart.cartItems[i].foodItem._id == item) {
                        itemPresent = true;
                        await CartItem.findOneAndUpdate({ _id: cart.cartItems[i]._id }, { $inc: { "quantity": quantity } });

                        cart.save((err, updatedCart) => {
                            if (updatedCart) {
                                Cart.findOne({ _id: req.session.cartId }, (err, cart) => {
                                    if (cart) {
                                        return res.status(200).send(cart);
                                    } else {
                                        return res.send(err);
                                    }
                                }).populate({
                                    path: 'cartItems',
                                    populate: {
                                        path: 'foodItem'
                                    }
                                });
                            } else {
                                return res.status(201).json({
                                    status: false,
                                    message: "Unable to add item to cart. If problem persists, please contact administrator. ErrorCode: 6008",
                                    err: err
                                });
                            }
                        });
                    }
                }

                if (!itemPresent) {
                    let newCartItem = new CartItem({
                        foodItem: req.body.food_id,
                        quantity: req.body.quantity
                    });
                    newCartItem.save((err, cartItem) => {
                        if (err) {
                            return res.status(500).send('Can\'t save cart item');
                        } else {
                            newCartItem = cartItem;
                        }
                    });
                    cart.cartItems.push(newCartItem);
                    cart.save((err, updatedCart) => {
                        if (updatedCart) {
                            Cart.findOne({ _id: req.session.cartId }, (err, cart) => {
                                if (cart) {
                                    return res.status(200).send(cart);
                                } else {
                                    return res.send(err);
                                }
                            }).populate({
                                path: 'cartItems',
                                populate: {
                                    path: 'foodItem'
                                }
                            });
                        } else {
                            return res.status(500).json({
                                status: false,
                                message: "Unable to add item to cart. If problem persists, please contact administrator. ErrorCode: 6009",
                                error: err
                            })
                        }
                    });
                }

            } else {
                req.session.destroy((err) => {
                    if (err) {
                        res.status(500).json({
                            status: false,
                            message: "Can't destroy session. ErrorCode- 6010",
                            error: err.message
                        });
                    } else {
                        res.status(404).json({
                            status: false,
                            message: "Invalid session",
                            cart: {}
                        });
                    }
                });
            }
        }).populate({
            path: 'cartItems',
            populate: {
                path: 'foodItem'
            }
        });
    } else {
        let newCartItem = new CartItem({
            foodItem: req.body.food_id,
            quantity: req.body.quantity
        });
        await newCartItem.save((err, cartItem) => {
            if (err) {
                return res.status(500).send('Can\'t save cart item');
            } else {
                newCartItem = cartItem;
            }
        });

        let newCart = new Cart({
            cartItems: [newCartItem._id]
        });
        await newCart.calculateTotal([newCartItem._id]).then(
            (x) => {
                newCart.total = x;
                console.log(x);
            });
        newCart.save((errCartSave, cart) => {
            if (errCartSave) return res.status(500).json({
                status: false,
                message: "Something went wrong. Please try again later. ErrorCode- 6011",
                error: errCartSave.message
            });
            else {
                req.session.cartId = cart._id;
                Cart.findOne({ _id: cart._id }, (err, cartFinal) => {
                    if (cartFinal) {
                        return res.status(200).send(cartFinal);
                    } else {
                        return res.send(err);
                    }
                }).populate({
                    path: 'cartItems',
                    populate: {
                        path: 'foodItem'
                    }
                });
            }
        });
    }
}


module.exports.deleteCart = async(req, res, next) => {
    if (!ensureStudentSession(req, res)) return;
    if (!req.session.cartId) {
        return res.send();
    }

    try {
        const cart = await Cart.findOne({ _id: req.session.cartId }).lean();
        if (cart && cart.cartItems && cart.cartItems.length) {
            await CartItem.deleteMany({ _id: { $in: cart.cartItems } });
        }
        await Cart.deleteOne({ _id: req.session.cartId });
        req.session.destroy(() => {});
        return res.send();
    } catch (err) {
        return next(err);
    }
}

module.exports.removeCartItem = async(req, res, next) => {
    if (!ensureStudentSession(req, res)) return;
    if (!req.session.cartId) {
        return res.status(404).json({
            status: false,
            message: "No cart found"
        });
    }
    try {
        const cartItemId = req.params.id;
        const cart = await Cart.findOne({ _id: req.session.cartId });
        if (!cart) {
            return res.status(404).json({
                status: false,
                message: "Cart not found"
            });
        }
        const present = cart.cartItems.some(item => item.toString() === cartItemId);
        if (!present) {
            return res.status(404).json({
                status: false,
                message: "Item not found in cart"
            });
        }
        cart.cartItems = cart.cartItems.filter(item => item.toString() !== cartItemId);
        await CartItem.deleteOne({ _id: cartItemId });
        await cart.save();
        const updated = await Cart.findOne({ _id: cart._id }).populate({
            path: 'cartItems',
            populate: {
                path: 'foodItem'
            }
        });
        return res.status(200).json(updated);
    } catch (err) {
        return next(err);
    }
}
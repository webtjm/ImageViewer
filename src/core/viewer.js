import {
    query,
    setTranslateStyle,
    setScaleAndTranslateStyle
} from '../common/dom';
import {
    ITEM_ANIMATION_CLASS,
    LOCK_NAME
} from '../common/profile';
import lock from '../common/lock';
import Event from '../common/event';

class Viewer {
    constructor(imageViewer, el, width, height, index) {
        this.event = new Event(false);
        this.imageViewer = imageViewer;
        this.el = el;              // .viewer类
        this.panelEl = el.firstElementChild; // .panel类
        this.imageEl = query('img', this.el)[0];
        this.tipsEl = query('span', this.el)[0];
        this.src = '';
        this.index = index;        // viewer排序用，记录原始的数组位置
        this.displayIndex = 0;
        this.width = width;
        this.height = height;
        this.realWidth = 0;
        this.realHeight = 0;
        this.translateX = 0;
        this.translateY = 0;
        this.scale = 1;            // 缩放比例
        this.currentScale = 1;     // 当前正在缩放的倍数(临时保存,当事件结束后,会赋值回scale)
        this.translatePanelX = 0;  // 最终图片面板所在的X轴坐标
        this.translatePanelY = 0;  // 最终图片面板所在的Y轴坐标
        this.currentPanelX = 0;    // 当前图片面板所在的X轴坐标（手指尚未离开屏幕）
        this.currentPanelY = 0;    // 当前图片面板所在的Y轴坐标（手指尚未离开屏幕）
        this.allowDistanceX = 0;   // 图片放大后，允许拖动的最大X轴距离
        this.allowDistanceY = 0;   // 图片放大后，允许拖动的最大Y轴距离
        this.needResetX = false;   // 拖动图片超出边界时，需要重置一下x轴的坐标
        this.needResetY = false;   // 拖动图片超出边界时，需要重置一下y轴的坐标
        this.SUCCESS_EVENT = 'LOAD_COMPLETE';
        this.FAIL_EVENT = 'LOAD_FAIL';
        this._bindEvent();
    }

    /**
     * 初始化图片以及容器
     * @param displayIndex 显示的位置，-1代表左边，0代表当前(即中间位置，目前显示的那张)，1代表右边
     * @param resetScale 是否重置缩放倍数
     * @param fn 初始化完成的回调函数
     * @param needLoad 是否需要加载图片
     * @param src 小图的url
     * @param largeSrc 大图的url，如果传递该参数，则会先展示小图再加载大图
     */
    init(displayIndex = 0, resetScale, fn, needLoad = true, src, largeSrc) {
        const _initImage = () => {
            if (resetScale) {
                this.scale = 1;
                this.allowDistanceX = this.allowDistanceY = 0;
            }
            if (needLoad) {
                this.imageEl.style.display = '';
            }
            this.translatePanelX = 0;
            this.translatePanelY = 0;
            this.currentPanelX = 0;
            this.currentPanelY = 0;
            this.realWidth = this.panelEl.clientWidth * this.scale;
            this.realHeight = this.panelEl.clientHeight * this.scale;
            this.translateX = this.displayIndex * this.width;
            this.translateY = -this.el.clientHeight / 2;
            this.needResetX = this.needResetY = false;
            setScaleAndTranslateStyle(this.panelEl, this.scale, this.translatePanelX, this.translatePanelY);
            setTranslateStyle(this.el, this.translateX, this.translateY);
            fn && fn.apply(this);
        };
        this.displayIndex = displayIndex;

        if (needLoad) {
            this.src = src;
            this.imageEl.src = this.src;
            this.imageEl.style.display = 'none';
            if (src) {
                this.tipsEl.style.display = 'inline-block';
                this.tipsEl.innerText = '图片加载中';
            }
            this.event.on(this.SUCCESS_EVENT, () => {
                // 如果图片尚未加载完就切换下一张图片，那么图片的url是不一样的
                if (src && src === this.src) {
                    _initImage();
                    this.tipsEl.style.display = 'none';
                }
            });
            this.event.on(this.FAIL_EVENT, () => {
                if (src && src === this.src) {
                    this.imageEl.style.display = 'none';
                    this.tipsEl.innerText = '图片加载失败';
                }
            });
            setTranslateStyle(this.el, this.displayIndex * this.width, this.translateY);
        } else {
            _initImage();
        }
    }

    _bindEvent() {
        this.imageEl.addEventListener('load', () => {
            this.event.emit(this.SUCCESS_EVENT);
        }, false);
        this.imageEl.addEventListener('error', () => {
            this.event.emit(this.FAIL_EVENT);
        }, false);
    }

    _pinchStart() {
        this.removeAnimation();
        this.panelEl.style.willChange = 'transform';
    }

    _pinch(scale) {
        let currentScale = scale * this.scale + this.scale;
        if (currentScale > 0.5 && currentScale < 8) {
            this.currentScale = currentScale;
            setScaleAndTranslateStyle(this.panelEl, this.currentScale, this.translatePanelX, this.translatePanelY);
        }
    }

    _pinchEnd(scale) {
        this.scale = isNaN(scale) ? this.currentScale : scale;
        this.realWidth = this.panelEl.clientWidth * this.scale;
        this.realHeight = this.panelEl.clientHeight * this.scale;
        this.allowDistanceX = (this.realWidth - this.width) / 2 / this.scale + 2;
        this.allowDistanceY = (this.realHeight - this.height) / 2 / this.scale + 2;
        if (this.realWidth < this.width || this.realHeight < this.height) {
            this.addAnimation();
            this.init(this.displayIndex, false, null, false);
        }
        window.requestAnimationFrame(() => {
            if (this.isScale()) {
                lock.getLock(LOCK_NAME);
            } else {
                lock.releaseLock(LOCK_NAME);
            }
            this.panelEl.style.willChange = 'auto';
        });
    }

    _calculate(a, b) {
        return a > 0 ? (a - b) : (a + b);
    }

    _translatePanelStart() {
        this.removeAnimation();
    }

    _translatePanel(event) {
        let tempX = 0;
        const translatePanelX = event.deltaX;
        const translatePanelY = event.deltaY;
        if (this.realWidth <= this.width && translatePanelX) {
            this.imageViewer._dealWithMoveAction({deltaX: translatePanelX}, true);
        } else {
            if (this.allowDistanceX > 0 && translatePanelX) {
                this.currentPanelX = translatePanelX / this.scale + this.translatePanelX;
                this.needResetX = !(-this.allowDistanceX < this.currentPanelX && this.currentPanelX < this.allowDistanceX);
            }

            if (this.needResetX) {
                this.imageViewer._dealWithMoveAction({deltaX: this._calculate(this.currentPanelX, this.allowDistanceX)}, true);
                tempX = this.currentPanelX > 0 ? this.allowDistanceX : -this.allowDistanceX;
            } else {
                this.imageViewer._dealWithMoveAction({deltaX: 0}, true);
                tempX = this.currentPanelX;
            }
        }
        if (this.allowDistanceY > 0 && translatePanelY) {
            this.currentPanelY = translatePanelY / this.scale + this.translatePanelY;
            this.needResetY = !(-this.allowDistanceY < this.currentPanelY && this.currentPanelY < this.allowDistanceY);
        }
        setScaleAndTranslateStyle(this.panelEl, this.scale, tempX, this.currentPanelY);
    }

    _translatePanelEnd(event) {
        let needSwipe = false;
        const translatePanelX = event.deltaX;
        if (this.realWidth <= this.width && translatePanelX) {
            needSwipe = this.imageViewer._dealWithMoveActionEnd({deltaX: translatePanelX}, true);
        } else if (this.needResetX) {
            needSwipe = this.imageViewer._dealWithMoveActionEnd({deltaX: this._calculate(this.currentPanelX, this.allowDistanceX)}, true);
        }
        if (needSwipe) {
            // 滑动到下一张，重置当前图片的尺寸
            this.init(this.displayIndex, true, null, false);
            window.requestAnimationFrame(() => {
                lock.releaseLock(LOCK_NAME);
            });
        } else {
            if (this.needResetX) {
                this.translatePanelX = this.currentPanelX > 0 ?
                    this.allowDistanceX : -this.allowDistanceX;
            } else {
                this.translatePanelX = this.currentPanelX;
            }
            if (this.needResetY) {
                this.translatePanelY = this.currentPanelY > 0 ?
                    this.allowDistanceY : -this.allowDistanceY;
            } else {
                this.translatePanelY = this.currentPanelY;
            }
            if (this.needResetX || this.needResetY) {
                window.requestAnimationFrame(() => {
                    this.addAnimation();
                    setScaleAndTranslateStyle(this.panelEl, this.scale, this.translatePanelX, this.translatePanelY);
                });
            }
            this.needResetX = this.needResetY = false;
        }
    }

    isScale() {
        return Math.abs(this.scale - 1) > 0.01;
    }

    addAnimation() {
        this.panelEl.classList.add(ITEM_ANIMATION_CLASS);
        this.el.classList.add(ITEM_ANIMATION_CLASS);
    }

    removeAnimation() {
        this.panelEl.classList.remove(ITEM_ANIMATION_CLASS);
        this.el.classList.remove(ITEM_ANIMATION_CLASS);
    }

    clearImg() {
        this.src = this.imageEl.src = '';
    }
}

export default Viewer;